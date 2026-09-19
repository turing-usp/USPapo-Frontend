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
 * The P11 GAP: USPapo-Backend/app/main.py currently exposes ONLY
 * `GET /api/analytics/resumo` (plus /api/chat and /api/health*) — there is
 * no `/api/feedback` route. Per the P10 scope the backend is owned by other
 * workstreams, so no endpoint was added here; `carregarFeedback` below is
 * the one-function seam the screen wires to. Note the stopgap the backend
 * ALREADY exposes: `resumo().data.feedback.itens` (30-day window, up to 50
 * rows, owner PII-free: id/tipo/motivo/comentario/created_at) — P11 may
 * either add a dedicated `/api/feedback` or point this seam at
 * `carregarResumo().feedback.itens` (see app/(admin)/metricas.ts).
 */

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
 * SEAM (wire point): loads the feedback list from the backend.
 *
 * TODO(P11): point this at the backend endpoint. Expected wiring (one
 * function, no screen changes): `GET {backendUrl()}/api/feedback` with the
 * same admin header contract as the panel (X-Admin-Key, see
 * app/(admin)/metricas.ts), mapping the rows to { data: created_at,
 * nota: tipo, motivo }. Until the endpoint exists it resolves to an empty
 * list, and the screen renders its documented empty state instead of
 * pretending there is data.
 */
export async function carregarFeedback(): Promise<ItemFeedbackWeb[]> {
  return [];
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
