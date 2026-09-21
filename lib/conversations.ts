/**
 * Conversation store over the Supabase client from lib/supabase.
 *
 * The database is NORMALISED and shared with the old site, so this module is
 * the adapter between it and the app's `Conversa`:
 *
 *   conversas  id, user_id, titulo, criada_em, atualizada_em, favorita
 *   mensagens  id, conversa_id, pergunta, resposta, fontes, ordem, criada_em
 *
 * A conversation is a LIST OF TURNS, `mensagens` ordered by `ordem` — that
 * is what the schema has always said and what the old site wrote. An earlier
 * version of this app read only `ordem = 0` and made every follow-up start a
 * brand-new conversation, which is why a multi-turn chat showed a single
 * question and answer with the earlier turns nowhere on screen. `mensagens`
 * now carries all of them; `pergunta` / `resposta` / `fontes` are kept as
 * derived fields (the FIRST question — the history label — and the LAST
 * answer) so the history screen and the offline cache read unchanged.
 *
 * The P9 pending rule (ported from the old site's `resposta NULL = pending`
 * pattern): a turn row is INSERTED with `resposta = null` the moment the
 * question is sent; the response is written ONLY when the stream completes.
 * A stream that dies mid-way therefore leaves the turn pending (the UI
 * renders it as pending and re-sends it on the next open) — and the
 * completion UPDATE is filtered on `resposta IS NULL`, so a saved resposta is
 * NEVER overwritten, no matter how late a duplicate completion arrives.
 *
 * The 5-favorites cap is enforced by the DB trigger (the trigger is the
 * authoritative source; LIMITES.favorites is only the client-side
 * pre-check). `favoritar` just sets the flag and relays the server's
 * rejection as-is.
 *
 * Timestamps are ISO-8601 strings; `criada_em`/`atualizada_em` are managed
 * by the server-side trigger, and the client keeps both in sync on writes.
 */
import { LIMITES } from './limits';
import { supabase } from './supabase';

/** One turn of a conversation (a `mensagens` row). */
export type Mensagem = {
  /** Position in the conversation, 0-based — the `ordem` column. */
  ordem: number;
  pergunta: string;
  /** null = pending (the stream has not completed yet — the P9 pattern). */
  resposta: string | null;
  /** Source URLs the answer cited (`mensagens.fontes`, a text[]). */
  fontes: string[];
};

/** One row of the `conversas` table, with its turns. */
export type Conversa = {
  id: string;
  /**
   * The conversation's label (`conversas.titulo`) — what the history list
   * shows and what "Renomear" edits. Empty for a row that has no title yet,
   * and the question stands in for it.
   */
  titulo: string;
  /** Every turn, oldest first. */
  mensagens: Mensagem[];
  /** The FIRST question — the history label and the resume card's line. */
  pergunta: string;
  /** The LAST answer; null while the last turn is still pending. */
  resposta: string | null;
  /** ISO-8601 timestamp. */
  criada_em: string;
  /** ISO-8601 timestamp (server trigger keeps it fresh on updates). */
  atualizada_em: string;
  favorita: boolean;
  /** Source URLs of the LAST answer. */
  fontes: string[];
};

/** The supabase client seam (lib/supabase by default; fakes in tests). */
export type ConversasDb = typeof supabase;

const TABELA = 'conversas';
const TABELA_MENSAGENS = 'mensagens';
const COLUNAS = 'id,titulo,criada_em,atualizada_em,favorita';
const COLUNAS_MENSAGEM = 'conversa_id,pergunta,resposta,ordem,fontes';

/** The first turn of a conversation: the one that creates the row. */
const ORDEM_PRIMEIRA = 0;
/** `titulo` is the conversation's label in the old site's schema. */
const TITULO_MAX = 80;

/**
 * What the history row should read.
 *
 * `titulo` is the conversation's own label and the thing "Renomear" edits,
 * so it has to win — otherwise a rename would not show. But the rows the old
 * site wrote store the question already cut at 50 characters ("Tô na estação
 * butanta. Como chego na sala A5 da me..."), and this app has the full
 * question on hand. So: show the title, UNLESS the title is merely the
 * question cut short, in which case show the question in full. A renamed row
 * stops being a prefix of the question and starts showing its new name.
 */
export function rotuloDa(conversa: Pick<Conversa, 'titulo' | 'pergunta'>): string {
  const titulo = conversa.titulo.trim();
  const pergunta = conversa.pergunta.trim();
  if (titulo === '') return pergunta;
  if (pergunta === '') return titulo;
  const semCorte = titulo.replace(/(\.\.\.|…)$/, '').trim();
  if (semCorte !== '' && pergunta.startsWith(semCorte)) return pergunta;
  return titulo;
}

/** The question, trimmed to something that reads as a list label. */
function tituloDe(pergunta: string): string {
  const limpo = pergunta.trim().replace(/\s+/g, ' ');
  return limpo.length <= TITULO_MAX ? limpo : `${limpo.slice(0, TITULO_MAX - 1)}…`;
}

/** Generic write-failure message (the cause stays in the console). */
const ERRO_ESCRITA = 'A operação falhou: não foi possível salvar a conversa';

/**
 * Raises on a PostgREST error. The old site swallowed these — the worst
 * kind of bug, because a failed write looked like a success and the student
 * ended up in an empty conversation with no hint of why. The new seam
 * raises: the caller (useChat / the history screen) decides how to react.
 */
function falhou(operacao: string, error: { message?: string } | null): void {
  if (!error) return;
  console.error(`[conversas] ${operacao} falhou:`, error);
  throw new Error(ERRO_ESCRITA);
}

/** One `mensagens` row → a Mensagem (defensive about the wire types). */
function linhaParaMensagem(m: Record<string, unknown>): Mensagem {
  const resposta = m.resposta;
  const fontes = m.fontes;
  return {
    ordem: Number(m.ordem ?? 0),
    pergunta: String(m.pergunta ?? ''),
    resposta: resposta === null || resposta === undefined ? null : String(resposta),
    fontes: Array.isArray(fontes) ? fontes.map(String) : [],
  };
}

/**
 * Joins a `conversas` row to its turns.
 *
 * A conversation with no turn yet still has to render — the insert of the
 * first message can fail on its own — so `titulo` is the fallback question:
 * that is exactly what it holds.
 */
function linhaParaConversa(
  linha: Record<string, unknown>,
  mensagens: Mensagem[],
): Conversa {
  const ordenadas = [...mensagens].sort((a, b) => a.ordem - b.ordem);
  const primeira = ordenadas[0];
  const ultima = ordenadas[ordenadas.length - 1];
  return {
    id: String(linha.id ?? ''),
    titulo: String(linha.titulo ?? ''),
    mensagens: ordenadas,
    pergunta: primeira ? primeira.pergunta : String(linha.titulo ?? ''),
    resposta: ultima ? ultima.resposta : null,
    fontes: ultima ? ultima.fontes : [],
    criada_em: String(linha.criada_em ?? ''),
    atualizada_em: String(linha.atualizada_em ?? ''),
    favorita: linha.favorita === true,
  };
}

/** Groups `mensagens` rows by conversation id. */
function porConversa(linhas: Record<string, unknown>[]): Map<string, Mensagem[]> {
  const mapa = new Map<string, Mensagem[]>();
  for (const m of linhas) {
    const chave = String(m.conversa_id ?? '');
    const lista = mapa.get(chave);
    if (lista) lista.push(linhaParaMensagem(m));
    else mapa.set(chave, [linhaParaMensagem(m)]);
  }
  return mapa;
}

/**
 * Reads the conversation history: the last `limite` conversations of the
 * user (default `LIMITES.history` = 30), newest first, each with ALL of its
 * turns.
 *
 * To send a conversation to the backend as context, map its `mensagens` to
 * the wire pairs `{pergunta, resposta}` and SKIP the pending ones (resposta
 * null) — the backend's `normalize_history` would drop them anyway.
 */
export async function lerHistorico(
  userId: string,
  limite: number = LIMITES.history,
  db: ConversasDb = supabase,
): Promise<Conversa[]> {
  const { data, error } = await db
    .from(TABELA)
    .select(COLUNAS)
    .eq('user_id', userId)
    .order('atualizada_em', { ascending: false })
    .limit(limite);
  falhou('lerHistorico', error);
  const linhas = (data ?? []) as Record<string, unknown>[];
  if (linhas.length === 0) return [];

  // The turns come in a second query rather than a PostgREST embed: the embed
  // needs the FK relationship to be exposed in the schema cache, and falling
  // back to two plain selects keeps this working either way.
  const ids = linhas.map((l) => String(l.id ?? ''));
  const { data: msgs, error: erroMsgs } = await db
    .from(TABELA_MENSAGENS)
    .select(COLUNAS_MENSAGEM)
    .in('conversa_id', ids)
    .order('ordem', { ascending: true });
  falhou('lerHistorico (mensagens)', erroMsgs);

  const agrupadas = porConversa((msgs ?? []) as Record<string, unknown>[]);
  return linhas.map((l) =>
    linhaParaConversa(l, agrupadas.get(String(l.id ?? '')) ?? []),
  );
}

/**
 * One conversation with every turn — what the chat screen opens.
 *
 * Scoped by `user_id` so a guessed id can never reach someone else's
 * conversation (RLS says the same thing server-side; the filter keeps the
 * query honest and cheap). Returns null when there is no such row.
 */
export async function lerConversa(
  userId: string,
  id: string,
  db: ConversasDb = supabase,
): Promise<Conversa | null> {
  const { data, error } = await db
    .from(TABELA)
    .select(COLUNAS)
    .eq('user_id', userId)
    .eq('id', id)
    .limit(1);
  falhou('lerConversa', error);
  const linha = ((data ?? []) as Record<string, unknown>[])[0];
  if (!linha) return null;

  const { data: msgs, error: erroMsgs } = await db
    .from(TABELA_MENSAGENS)
    .select(COLUNAS_MENSAGEM)
    .eq('conversa_id', id)
    .order('ordem', { ascending: true });
  falhou('lerConversa (mensagens)', erroMsgs);

  const mensagens = ((msgs ?? []) as Record<string, unknown>[]).map(linhaParaMensagem);
  return linhaParaConversa(linha, mensagens);
}

/**
 * Appends (or completes) ONE turn of a conversation — the P9 rule, per turn:
 *
 * - without `resposta` — on SEND: inserts the turn with `resposta = null`
 *   (pending). Turn 0 creates the `conversas` row first, because
 *   `mensagens.conversa_id` points at it; a later turn only inserts the
 *   message and touches `atualizada_em`. A mid-stream death leaves the turn
 *   pending and nothing else is written;
 * - with `resposta` — on COMPLETION: sets `resposta` only where it is still
 *   null, FOR THAT `ordem`. A saved resposta is never overwritten (a late or
 *   duplicate completion is a no-op by construction), and completing turn 3
 *   cannot touch turn 1.
 */
export async function anexarMensagem(
  userId: string,
  id: string,
  turno: { ordem: number; pergunta: string; resposta?: string; fontes?: string[] },
  db: ConversasDb = supabase,
): Promise<void> {
  const agora = new Date().toISOString();

  if (turno.resposta === undefined) {
    if (turno.ordem === ORDEM_PRIMEIRA) {
      // The conversation row first: `mensagens.conversa_id` points at it, so
      // the message insert would violate the FK if this failed.
      const { error: erroConversa } = await db.from(TABELA).insert({
        id,
        user_id: userId,
        titulo: tituloDe(turno.pergunta),
        favorita: false,
        criada_em: agora,
        atualizada_em: agora,
      });
      falhou('anexarTurno (conversa)', erroConversa);
    }

    // `id` is left to the database default; `ordem` is explicit — it is the
    // turn's position and the key the completion below filters on.
    const { error: erroMensagem } = await db.from(TABELA_MENSAGENS).insert({
      conversa_id: id,
      pergunta: turno.pergunta,
      resposta: null,
      ordem: turno.ordem,
      criada_em: agora,
    });
    falhou('anexarTurno (pergunta)', erroMensagem);

    if (turno.ordem !== ORDEM_PRIMEIRA) {
      // A follow-up has to bring the conversation back to the top of the
      // history; turn 0 already wrote `atualizada_em` with the row.
      const { error: erroToque } = await db
        .from(TABELA)
        .update({ atualizada_em: agora })
        .eq('id', id)
        .eq('user_id', userId);
      falhou('anexarTurno (atualizada_em)', erroToque);
    }
    return;
  }

  const { error } = await db
    .from(TABELA_MENSAGENS)
    // The sources travel with the answer, as the old site wrote them: they
    // are part of the completed turn, and without this the "Fontes
    // consultadas" row was empty on every reopened conversation.
    .update({
      // The question travels with the completion too. It is normally the
      // same text that was inserted on send, but not always: a turn whose
      // stream failed stays pending, and if the student then asks something
      // DIFFERENT the new question reuses that pending slot (the (conversa_id,
      // ordem) key is taken). Writing it here keeps the saved pair honest —
      // and the `resposta IS NULL` guard below means an answered turn is
      // still never touched.
      pergunta: turno.pergunta,
      resposta: turno.resposta,
      ...(turno.fontes !== undefined ? { fontes: turno.fontes } : {}),
    })
    .eq('conversa_id', id)
    .eq('ordem', turno.ordem)
    // The P9 guard: complete only turns that are still pending.
    .is('resposta', null);
  falhou('anexarTurno (resposta)', error);

  // Keep the conversation's ordering key fresh — `lerHistorico` sorts on it.
  // Scoped by user_id so a wrong id can never touch someone else's row.
  const { error: erroToque } = await db
    .from(TABELA)
    .update({ atualizada_em: agora })
    .eq('id', id)
    .eq('user_id', userId);
  falhou('anexarTurno (atualizada_em)', erroToque);
}

/**
 * The first turn of a conversation — `anexarMensagem` with `ordem` 0. Kept
 * as its own name because that is what the "new conversation" paths (the
 * home screen handoff, the offline queue replay) always write.
 */
export async function anexarTurno(
  userId: string,
  id: string,
  pergunta: string,
  resposta?: string,
  fontes?: string[],
  db: ConversasDb = supabase,
): Promise<void> {
  return anexarMensagem(
    userId,
    id,
    { ordem: ORDEM_PRIMEIRA, pergunta, resposta, fontes },
    db,
  );
}

/**
 * Renames the conversation (`conversas.titulo`) — the old site's
 * `renomearConversa`. A blank title is refused rather than stored: the
 * history list would then show an unlabelled row.
 */
export async function renomear(
  userId: string,
  id: string,
  titulo: string,
  db: ConversasDb = supabase,
): Promise<void> {
  const limpo = titulo.trim();
  if (limpo === '') return;
  const { error } = await db
    .from(TABELA)
    .update({ titulo: limpo, atualizada_em: new Date().toISOString() })
    .eq('id', id)
    .eq('user_id', userId);
  falhou('renomear', error);
}

/**
 * Sets `favorita` on the row. The 5-favorites cap is enforced by the DB
 * trigger, which is authoritative: this client just sets the flag and
 * relays the server's rejection (the PostgREST error) as-is, so the caller
 * can surface it (optimistic rollback in the history screen).
 */
export async function favoritar(
  userId: string,
  id: string,
  valor: boolean,
  db: ConversasDb = supabase,
): Promise<void> {
  const { error } = await db
    .from(TABELA)
    .update({ favorita: valor })
    .eq('id', id)
    .eq('user_id', userId);
  if (error) {
    console.error('[conversas] favoritar falhou:', error);
    throw new Error(
      `A operação falhou: ${error.message ?? 'não foi possível favoritar a conversa'}`,
    );
  }
}

/** Deletes the turn row (only the user's own rows, by the RLS ownership). */
export async function excluir(userId: string, id: string, db: ConversasDb = supabase): Promise<void> {
  const { error } = await db
    .from(TABELA)
    .delete()
    .eq('id', id)
    .eq('user_id', userId);
  falhou('excluir', error);
}

/**
 * Search over the LOADED window: the same last-`LIMITES.history`
 * conversations `lerHistorico` reads, filtered locally by substring over the
 * title and EVERY turn's question and answer (case-insensitive). No
 * full-table scan and no FTS — the window is the honest scope for now; P9
 * may back this with the offline SQLite cache (FTS) and this seam will keep
 * the same contract.
 */
export async function buscar(
  userId: string,
  termo: string,
  db: ConversasDb = supabase,
): Promise<Conversa[]> {
  const t = termo.trim().toLowerCase();
  const janela = await lerHistorico(userId, LIMITES.history, db);
  if (t === '') return janela;
  return janela.filter((c) => {
    if (c.titulo.toLowerCase().includes(t)) return true;
    return c.mensagens.some(
      (m) =>
        m.pergunta.toLowerCase().includes(t) ||
        (m.resposta ?? '').toLowerCase().includes(t),
    );
  });
}
