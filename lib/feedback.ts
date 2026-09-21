/**
 * Answer feedback store — `mensagem_feedbacks`, shared with the old site.
 *
 * Port of the old site's `site/lib/feedback.ts`, kept wire-compatible on
 * purpose: the analytics panel reads the SAME rows (the backend's
 * `resumo().data.feedback.itens` exposes id/tipo/motivo/comentario/created_at
 * — see app/(admin)/feedbackApi.ts), so a rating left in the app has to land
 * in the same shape the old site wrote.
 *
 *   mensagem_feedbacks  id, conversa_id, mensagem_ordem, user_id,
 *                       tipo ('like' | 'dislike'), motivo, comentario,
 *                       created_at, updated_at
 *
 * The row is keyed by (conversa_id, mensagem_ordem, user_id) — that is the
 * upsert's conflict target, so re-rating the same answer UPDATES instead of
 * piling duplicates into the panel.
 *
 * The rating is NOT the `favorita` flag. An earlier version routed 👍/👎
 * through `favoritar()`, which meant a thumbs-up silently pinned the
 * conversation (and hit the 5-favorites trigger), while the reason and the
 * comment were dropped on the floor and never reached the panel.
 */
import { supabase } from './supabase';

export type TipoFeedback = 'like' | 'dislike';

/** One `mensagem_feedbacks` row, as the chat screen reads it back. */
export type Feedback = {
  conversa_id: string;
  mensagem_ordem: number;
  tipo: TipoFeedback;
  motivo: string | null;
  comentario: string | null;
};

const TABELA = 'mensagem_feedbacks';
/** The first turn of a conversation (see lib/conversations). */
export const ORDEM_PADRAO = 0;

/** Logs the PostgREST cause and reports failure; never throws at the UI. */
function falhou(operacao: string, error: { message?: string } | null): boolean {
  if (!error) return false;
  console.error(`[feedback] ${operacao} falhou:`, error);
  return true;
}

/**
 * Saves (or re-saves) the rating for one answer.
 *
 * Returns false on failure instead of throwing: the row is an opinion, and
 * losing it must never take the answer off the screen. The caller surfaces
 * the failure inline.
 */
export async function salvarFeedback(params: {
  userId: string;
  conversaId: string;
  tipo: TipoFeedback;
  mensagemOrdem?: number;
  motivo?: string;
  comentario?: string;
}): Promise<boolean> {
  const { error } = await supabase.from(TABELA).upsert(
    {
      conversa_id: params.conversaId,
      mensagem_ordem: params.mensagemOrdem ?? ORDEM_PADRAO,
      user_id: params.userId,
      tipo: params.tipo,
      // Empty string is not a reason: the panel reads NULL as "not given".
      motivo: params.motivo?.trim() || null,
      comentario: params.comentario?.trim() || null,
      updated_at: new Date().toISOString(),
    },
    { onConflict: 'conversa_id,mensagem_ordem,user_id' },
  );
  return !falhou('salvarFeedback', error);
}

/** Drops the rating (the student un-toggled 👍/👎). */
export async function removerFeedback(params: {
  userId: string;
  conversaId: string;
  mensagemOrdem?: number;
}): Promise<boolean> {
  const { error } = await supabase
    .from(TABELA)
    .delete()
    .eq('conversa_id', params.conversaId)
    .eq('mensagem_ordem', params.mensagemOrdem ?? ORDEM_PADRAO)
    .eq('user_id', params.userId);
  return !falhou('removerFeedback', error);
}

/**
 * The student's own rating for an answer, or null when there is none.
 * RLS already scopes the table to the owner; the user_id filter keeps the
 * query honest (and cheap) rather than relying on it.
 */
export async function lerFeedback(params: {
  userId: string;
  conversaId: string;
  mensagemOrdem?: number;
}): Promise<Feedback | null> {
  const { data, error } = await supabase
    .from(TABELA)
    .select('conversa_id,mensagem_ordem,tipo,motivo,comentario')
    .eq('conversa_id', params.conversaId)
    .eq('mensagem_ordem', params.mensagemOrdem ?? ORDEM_PADRAO)
    .eq('user_id', params.userId)
    .limit(1);
  if (falhou('lerFeedback', error)) return null;
  const linha = (data ?? [])[0] as Record<string, unknown> | undefined;
  if (!linha) return null;
  const tipo = linha.tipo === 'like' || linha.tipo === 'dislike' ? linha.tipo : null;
  if (tipo === null) return null;
  return {
    conversa_id: String(linha.conversa_id ?? ''),
    mensagem_ordem: Number(linha.mensagem_ordem ?? ORDEM_PADRAO),
    tipo,
    motivo: linha.motivo == null ? null : String(linha.motivo),
    comentario: linha.comentario == null ? null : String(linha.comentario),
  };
}

/**
 * Every rating the student left in one conversation, keyed by
 * `mensagem_ordem` — the port of the old site's
 * `obterFeedbacksDaConversa`.
 *
 * A conversation is a list of turns, so the chat screen needs all of them at
 * once: one query per answer would be one round trip per turn, and reading
 * only turn 0 (which is what the single-rating read amounts to) put the
 * first answer's thumb under every later one.
 */
export async function lerFeedbacksDaConversa(params: {
  userId: string;
  conversaId: string;
}): Promise<Record<number, Feedback>> {
  const { data, error } = await supabase
    .from(TABELA)
    .select('conversa_id,mensagem_ordem,tipo,motivo,comentario')
    .eq('conversa_id', params.conversaId)
    .eq('user_id', params.userId);
  if (falhou('lerFeedbacksDaConversa', error)) return {};
  const mapa: Record<number, Feedback> = {};
  for (const bruta of (data ?? []) as Record<string, unknown>[]) {
    const tipo = bruta.tipo === 'like' || bruta.tipo === 'dislike' ? bruta.tipo : null;
    if (tipo === null) continue;
    const ordem = Number(bruta.mensagem_ordem ?? ORDEM_PADRAO);
    mapa[ordem] = {
      conversa_id: String(bruta.conversa_id ?? ''),
      mensagem_ordem: ordem,
      tipo,
      motivo: bruta.motivo == null ? null : String(bruta.motivo),
      comentario: bruta.comentario == null ? null : String(bruta.comentario),
    };
  }
  return mapa;
}
