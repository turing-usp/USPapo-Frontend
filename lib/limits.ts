/**
 * Client-side caps, in one place (port of the old site/lib/limites.ts).
 *
 * - conversations: how many non-favorite conversations are kept on close
 *   save; beyond the cap the oldest are pruned first (favorites never are).
 * - favorites: how many conversations the student can pin. The DB trigger
 *   (`limitar_favoritas`) is the AUTHORITATIVE source for this cap; the
 *   value here is only the client-side pre-check that keeps the UI honest
 *   before the server rejects the sixth favorite.
 * - history: how many previous turns are sent to the backend context along
 *   with the question (the backend still prunes by its own token budget).
 *
 * The rate limit (questions per minute) is a different thing and lives in
 * the backend: it protects the LLM provider quota and the client cannot
 * enforce it reliably.
 */
export const LIMITES = {
  /** Non-favorite conversations kept; the oldest are pruned beyond this. */
  conversations: 20,
  /** Favorite cap. The DB trigger remains authoritative for the rejection. */
  favorites: 5,
  /** Previous turns sent to the backend context per question. */
  history: 30,
};
