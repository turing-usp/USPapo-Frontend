/**
 * useChat — the chat data seam (P8 wires the real body).
 *
 * TODO(P8): implement against lib/api + lib/stream + lib/conversations:
 * - `send(pergunta)`: fire the question with `session_id` = the conversation
 *   uuid (LIMITES.history previous turns as context), then stream the
 *   answer (SSE: thinking → tools → text → sources) into `turns`/`status`;
 * - `status`: 'idle' → 'respondendo' → 'idle' | 'errou' (429 handling with
 *   Retry-After; "Sua sessão expirou" fast-fail back to login);
 * - `stop()`: cancel the in-flight stream (the send button becomes Stop);
 * - persist turn-by-turn via lib/conversations (upserts; resposta NULL =
 *   pending) and only then discard the pendente entry for this id.
 *
 * For now the body returns a documented empty state so the screens are
 * fully navigable; the first user bubble + "respondendo…" on a fresh
 * conversation comes from the pendente Map (see the [id] screen), not from
 * this hook.
 */

export type Turno = {
  id: string;
  autor: 'user' | 'assistant';
  texto: string;
};

export type ChatStatus = 'idle' | 'respondendo' | 'errou';

export type UseChat = {
  turns: Turno[];
  status: ChatStatus;
  send: (pergunta: string) => void;
  stop: () => void;
};

export function useChat(
  id: string | undefined,
  _opts?: { enabled?: boolean },
): UseChat {
  // TODO(P8): the real hook body lives here (see the file note above).
  void id;
  void _opts;
  return {
    turns: [],
    status: 'idle',
    send: (_pergunta: string) => undefined,
    stop: () => undefined,
  };
}
