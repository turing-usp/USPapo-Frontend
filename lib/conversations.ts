/**
 * Conversation store over the Supabase client from lib/supabase.
 *
 * The database is NORMALISED and shared with the old site, so this module is
 * the adapter between it and the app's flat `Conversa`:
 *
 *   conversas  id, user_id, titulo, criada_em, atualizada_em, favorita
 *   mensagens  id, conversa_id, pergunta, resposta, criada_em, ordem
 *
 * An earlier version wrote `pergunta`/`resposta` straight onto `conversas`,
 * which does not have those columns: every read failed with 42703 and every
 * write with PGRST204, so no conversation was ever saved or listed.
 *
 * The app's model is one question per conversation (a follow-up starts a new
 * one — see app/(main)/chat/[id].tsx), so a `Conversa` is a `conversas` row
 * joined to its FIRST `mensagens` row (`ordem` 0). The flat shape is what the
 * history screen, the offline cache and the backend context all consume, and
 * it is kept unchanged here on purpose.
 *
 * The P9 pending rule (ported from the old site's `resposta NULL = pending`
 * pattern): a turn row is INSERTED with `resposta = null` the moment the
 * question is sent; the response is written ONLY when the stream completes.
 * A stream that dies mid-way therefore leaves the row pending (the UI
 * renders it as pending and discards it on the next open of the same turn)
 * — and the completion UPDATE is filtered on `resposta IS NULL`, so a saved
 * resposta is NEVER overwritten, no matter how late a duplicate completion
 * arrives.
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

/** One row of the `conversas` table (one turn of a conversation). */
export type Conversa = {
  id: string;
  /**
   * The conversation's label (`conversas.titulo`) — what the history list
   * shows and what "Renomear" edits. Empty for a row that has no title yet,
   * and the question stands in for it.
   */
  titulo: string;
  pergunta: string;
  /** null = pending (the stream has not completed yet — the P9 pattern). */
  resposta: string | null;
  /** ISO-8601 timestamp. */
  criada_em: string;
  /** ISO-8601 timestamp (server trigger keeps it fresh on updates). */
  atualizada_em: string;
  favorita: boolean;
  /** Source URLs the answer cited (`mensagens.fontes`, a text[]). */
  fontes: string[];
};

/** The supabase client seam (lib/supabase by default; fakes in tests). */
export type ConversasDb = typeof supabase;

const TABELA = 'conversas';
const TABELA_MENSAGENS = 'mensagens';
const COLUNAS = 'id,titulo,criada_em,atualizada_em,favorita';
const COLUNAS_MENSAGEM = 'conversa_id,pergunta,resposta,ordem,fontes';

/** The app is one question per conversation, so every turn is the first. */
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

/**
 * Flattens a `conversas` row plus its first `mensagens` row into a Conversa.
 * A conversation with no message yet still has to render, so `titulo` is the
 * fallback question — that is exactly what it holds.
 */
function linhaParaConversa(
  linha: Record<string, unknown>,
  mensagem: Record<string, unknown> | undefined,
): Conversa {
  const pergunta = mensagem?.pergunta ?? linha.titulo ?? '';
  const resposta = mensagem?.resposta;
  const fontes = mensagem?.fontes;
  return {
    id: String(linha.id ?? ''),
    titulo: String(linha.titulo ?? ''),
    pergunta: String(pergunta),
    resposta: resposta === null || resposta === undefined ? null : String(resposta),
    criada_em: String(linha.criada_em ?? ''),
    atualizada_em: String(linha.atualizada_em ?? ''),
    favorita: linha.favorita === true,
    fontes: Array.isArray(fontes) ? fontes.map(String) : [],
  };
}

/**
 * Reads the conversation history: the last `limite` turns of the user
 * (default `LIMITES.history` = 30), newest first.
 *
 * To send it to the backend as context, map the rows to the wire pairs
 * `{pergunta, resposta}` and SKIP the pending rows (resposta null) — the
 * backend's `normalize_history` would drop them anyway.
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

  // First message per conversation wins (ordered by `ordem` above).
  const porConversa = new Map<string, Record<string, unknown>>();
  for (const m of (msgs ?? []) as Record<string, unknown>[]) {
    const chave = String(m.conversa_id ?? '');
    if (!porConversa.has(chave)) porConversa.set(chave, m);
  }
  return linhas.map((l) => linhaParaConversa(l, porConversa.get(String(l.id ?? ''))));
}

/**
 * Attaches a turn to a conversation (turn-by-turn upsert, P9 rule):
 *
 * - `anexarTurno(userId, id, pergunta)` (no resposta) — on SEND: inserts
 *   the row with `resposta = null` (pending). A mid-stream death leaves it
 *   pending; nothing else is written until the answer completes;
 * - `anexarTurno(userId, id, pergunta, resposta)` — on COMPLETION: sets
 *   `resposta` only where it is still null. A saved resposta is never
 *   overwritten (a late/duplicate completion is a no-op by construction).
 */
export async function anexarTurno(
  userId: string,
  id: string,
  pergunta: string,
  resposta?: string,
  fontes?: string[],
  db: ConversasDb = supabase,
): Promise<void> {
  const agora = new Date().toISOString();

  if (resposta === undefined) {
    // The conversation row first: `mensagens.conversa_id` points at it, so
    // the message insert would violate the FK if this failed.
    const { error: erroConversa } = await db.from(TABELA).insert({
      id,
      user_id: userId,
      titulo: tituloDe(pergunta),
      favorita: false,
      criada_em: agora,
      atualizada_em: agora,
    });
    falhou('anexarTurno (conversa)', erroConversa);

    // `id` is left to the database default; `ordem` is explicit because the
    // app only ever writes the first turn of a conversation.
    const { error: erroMensagem } = await db.from(TABELA_MENSAGENS).insert({
      conversa_id: id,
      pergunta,
      resposta: null,
      ordem: ORDEM_PRIMEIRA,
      criada_em: agora,
    });
    falhou('anexarTurno (pergunta)', erroMensagem);
    return;
  }

  const { error } = await db
    .from(TABELA_MENSAGENS)
    // The sources travel with the answer, as the old site wrote them: they
    // are part of the completed turn, and without this the "Fontes
    // consultadas" row was empty on every reopened conversation.
    .update({ resposta, ...(fontes !== undefined ? { fontes } : {}) })
    .eq('conversa_id', id)
    // The P9 guard: complete only rows that are still pending.
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
 * Search over the LOADED window: the same last-`LIMITES.history` rows
 * `lerHistorico` reads (one select), filtered locally by substring over
 * pergunta + resposta (case-insensitive). No full-table scan and no FTS —
 * the window is the honest scope for now; P9 may back this with the
 * offline SQLite cache (FTS) and this seam will keep the same contract.
 */
export async function buscar(
  userId: string,
  termo: string,
  db: ConversasDb = supabase,
): Promise<Conversa[]> {
  const t = termo.trim().toLowerCase();
  const janela = await lerHistorico(userId, LIMITES.history, db);
  if (t === '') return janela;
  return janela.filter(
    (c) => c.pergunta.toLowerCase().includes(t) || (c.resposta ?? '').toLowerCase().includes(t),
  );
}
