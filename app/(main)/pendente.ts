/**
 * First-question handoff: home → chat without waiting on the database.
 *
 * Port of the old site's lib/pendente.ts pattern. The home screen stores the
 * question here and navigates immediately; the chat screen reads it on the
 * first render and draws the user bubble at once. The real write (and the
 * prune/queue) happens in the background via lib/conversations (P8/P9).
 *
 * StrictMode safety: `lerPendente` reads WITHOUT consuming. The chat screen
 * calls it from a useState initializer, which StrictMode invokes twice in
 * development — a consuming read would come up empty on the second call and
 * the question would vanish from the screen. Deletion happens in P8, after
 * the first turn is persisted.
 *
 * The sessionStorage mirror is a web-only extra: it lets the question
 * survive an F5 before it reaches the database (the in-memory Map is enough
 * for the normal in-app path).
 */

export type ConversaPendente = {
  /** Conversation id (uuid) — also the backend session_id. */
  id: string;
  /** The question text (chat bubble + backend prompt). */
  question: string;
  /** Enqueue timestamp (ms since epoch). */
  enqueuedAt: number;
};

const CHAVE = 'uspapo:pendente:';

/** The module-level Map: the same instance on both sides because router
 * navigation does not reload the JS context. */
const emMemoria = new Map<string, ConversaPendente>();

const noNavegador = (): boolean => typeof window !== 'undefined';

export function guardarPendente(conversa: ConversaPendente): void {
  emMemoria.set(conversa.id, conversa);
  if (!noNavegador()) return;
  try {
    window.sessionStorage.setItem(CHAVE + conversa.id, JSON.stringify(conversa));
  } catch {
    /* Private tab with storage blocked, or quota exceeded: the in-memory
       Map is enough for the normal path; the mirror only covers reloads. */
  }
}

export function lerPendente(id: string): ConversaPendente | undefined {
  const daMemoria = emMemoria.get(id);
  if (daMemoria !== undefined) return daMemoria;
  if (!noNavegador()) return undefined;
  try {
    const bruto = window.sessionStorage.getItem(CHAVE + id);
    if (!bruto) return undefined;
    return JSON.parse(bruto) as ConversaPendente;
  } catch {
    return undefined;
  }
}
