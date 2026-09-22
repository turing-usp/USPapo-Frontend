/**
 * Admin feedback screen — data seam (P11). Lives in `feedbackApi.ts` (not
 * `feedback.ts`) because the route file is `feedback.tsx`: same base name in
 * two extensions is both a duplicate route for the router and an ambiguous
 * TypeScript module.
 *
 * The list must come from the backend, NOT from a direct Supabase query:
 * `mensagem_feedbacks` is owner-only RLS after the hardening migration
 * (USPapo-Backend/supabase/migrations/20260919130000_feedback_strict_rls.sql
 * — policy `feedback_owner_all`, anon and cross-user reads return 0 rows;
 * only `service_role` bypasses RLS, i.e. the backend's own reads).
 *
 * WHERE THE ROWS COME FROM: `GET /api/analytics/resumo` → `data.feedback.itens`
 * (30-day window, up to 50 rows, PII-free: id/tipo/motivo/comentario/
 * created_at). The backend has no dedicated `/api/feedback` route, and this
 * seam used to `return []` while waiting for one — so the screen always drew
 * its empty state and the operator read "no feedback yet" when there was
 * feedback. The summary endpoint already carries exactly the rows this screen
 * renders, and it is the same authenticated call the KPI panel makes
 * (./metricas.ts owns the credential), so nothing new has to be deployed.
 *
 * A dedicated endpoint can replace `carregarResumo` here later without the
 * screen noticing: the mapping below is the whole contract.
 */
import { carregarResumo } from './metricas';

/** One feedback row as the screen renders it. */
export type ItemFeedbackWeb = {
  /** ISO timestamp (created_at). */
  data: string;
  /** 'like' | 'dislike' (the backend `tipo` column). */
  nota: 'like' | 'dislike';
  /** The reason the student picked (or free text); may be absent. */
  motivo?: string;
};

/**
 * Loads the feedback list, newest first.
 *
 * A row with no `created_at` keeps its place at the END rather than being
 * dropped: the rating happened, only its timestamp is unreadable, and
 * silently hiding it would understate the volume. The free-text comment
 * stands in when the student typed one instead of picking a reason — that is
 * the more informative of the two, and the screen has one slot.
 *
 * Throws whatever `carregarResumo` throws (ResumoApiError on 403/503, the
 * network failure as-is): the screen turns that into its error state, which
 * is the honest answer to "I could not read the list".
 */
export async function carregarFeedback(
  signal?: AbortSignal,
): Promise<ItemFeedbackWeb[]> {
  const dados = await carregarResumo(signal);
  const itens = dados.feedback?.itens ?? [];
  return itens.map((item) => ({
    data: item.created_at ?? '',
    nota: item.tipo === 'like' ? 'like' : 'dislike',
    ...(item.motivo || item.comentario
      ? { motivo: item.motivo ?? item.comentario ?? undefined }
      : {}),
  }));
}

/** 'like' | 'dislike' → the pt-BR pill label. */
export function rotuloNota(nota: 'like' | 'dislike'): string {
  return nota === 'like' ? 'Gostei' : 'Não gostei';
}

/**
 * ISO timestamp → 'dd/mm/aaaa hh:mm' (string math: no Date/locale
 * surprises, deterministic across runtimes; unparseable input passes
 * through untouched).
 */
export function formataDataFeedback(iso: string): string {
  const m = /^(\d{4})-(\d{2})-(\d{2})(?:[T ](\d{2}):(\d{2}))?/.exec(iso);
  if (!m) return iso;
  const [, ano, mes, dia, hora, minuto] = m;
  return hora !== undefined ? `${dia}/${mes}/${ano} ${hora}:${minuto}` : `${dia}/${mes}/${ano}`;
}
