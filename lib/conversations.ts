/**
 * Conversation store over the Supabase client from lib/supabase.
 *
 * The table is `conversas` (RLS-owned by user_id); each row is ONE turn of a
 * conversation — `{pergunta, resposta}` — so the store is turn-granular and
 * the history screen and the backend context share one shape.
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
  pergunta: string;
  /** null = pending (the stream has not completed yet — the P9 pattern). */
  resposta: string | null;
  /** ISO-8601 timestamp. */
  criada_em: string;
  /** ISO-8601 timestamp (server trigger keeps it fresh on updates). */
  atualizada_em: string;
  favorita: boolean;
};

/** The supabase client seam (lib/supabase by default; fakes in tests). */
export type ConversasDb = typeof supabase;

const TABELA = 'conversas';
const COLUNAS = 'id,pergunta,resposta,criada_em,atualizada_em,favorita';

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

function linhaParaConversa(linha: Record<string, unknown>): Conversa {
  return {
    id: String(linha.id ?? ''),
    pergunta: String(linha.pergunta ?? ''),
    resposta: linha.resposta === null || linha.resposta === undefined ? null : String(linha.resposta),
    criada_em: String(linha.criada_em ?? ''),
    atualizada_em: String(linha.atualizada_em ?? ''),
    favorita: linha.favorita === true,
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
  return (data ?? []).map((l) => linhaParaConversa(l as Record<string, unknown>));
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
  db: ConversasDb = supabase,
): Promise<void> {
  const agora = new Date().toISOString();

  if (resposta === undefined) {
    const { error } = await db.from(TABELA).insert({
      id,
      user_id: userId,
      pergunta,
      resposta: null,
      favorita: false,
      criada_em: agora,
      atualizada_em: agora,
    });
    falhou('anexarTurno (pergunta)', error);
    return;
  }

  const { error } = await db
    .from(TABELA)
    .update({ resposta, atualizada_em: agora })
    .eq('id', id)
    .eq('user_id', userId)
    // The P9 guard: complete only rows that are still pending.
    .is('resposta', null);
  falhou('anexarTurno (resposta)', error);
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
