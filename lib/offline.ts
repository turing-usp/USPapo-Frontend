/**
 * Connectivity seam (P9 — light offline).
 *
 * `usandoCache()` answers "did the last network operation fail WITHOUT a
 * response?" — the offline state the UI shows ("Sem conexão — enviaremos
 * quando a internet voltar"). It is driven by OPERATION outcomes
 * (`marcarFalhaRede` / `marcarSucessoRede`, called from the chat send
 * path), not by the radio state alone: a device can report "online" while
 * the backend is unreachable, and the queue must be replayed when an
 * operation actually gets through.
 *
 * Connectivity mode (documented): `expo-network` (installed dependency;
 * `@react-native-community/netinfo` is NOT installed in this environment,
 * and lib/net already standardizes on expo-network). `quandoConectar`
 * fires on:
 *
 *   1. the expo-network state event that reports the device back online
 *      (while `usandoCache()` is true);
 *   2. the next successful network operation — `marcarSucessoRede()` is
 *      called after a successful streamChat / history read, so replay also
 *      happens when the event infrastructure is unavailable (the
 *      fetch-probe fallback: the fetch itself proves the connectivity).
 *
 * Replay wiring: a single registered reprocessor (the `reprocessarFila`
 * coordinator in app/(main)/chat/useChat) drains the lib/net queue in
 * order; the screens stay out of it (they only call `quandoConectar` to
 * refresh UI). Single-flight: a running replay is never re-entered.
 */
import { addNetworkStateListener } from 'expo-network';
import { ChatApiError } from './api';

/**
 * True when a thrown streamChat failure is a NETWORK failure (offline) —
 * the only kind that may be queued for replay.
 *
 * - a `ChatApiError` means the server ANSWERED (4xx/5xx — 429, 401, …):
 *   never queue those (a queued 429/401 would burn rate-limit slots);
 * - an aborted signal is the Stop button, not a failure;
 * - the no-token fast-fail ('Sua sessão expirou') is a session problem;
 * - fetch's network failures surface as a TypeError with no response
 *   ('Network request failed' / 'fetch failed'), or as an error whose
 *   message names the network/connection.
 */
export function eFalhaDeRede(erro: unknown, sinal: AbortSignal): boolean {
  if (sinal.aborted) return false;
  if (erro instanceof ChatApiError) return false;
  const mensagem =
    typeof erro === 'object' && erro !== null && 'message' in erro
      ? String((erro as { message: unknown }).message)
      : '';
  if (mensagem.includes('Sua sessão expirou')) return false;
  if (erro instanceof TypeError) return true;
  return /network|fetch failed|failed to fetch|internet|conex/i.test(mensagem);
}

// ─────────────────────────────────────────────
// The last-operation state (usandoCache)
// ─────────────────────────────────────────────

let ultimoFato: 'sucesso' | 'falha' | null = null;

/** "Is the last operation a network failure?" — the honest offline flag. */
export function usandoCache(): boolean {
  return ultimoFato === 'falha';
}

/** The last operation failed without a response (the app is offline). */
export function marcarFalhaRede(): void {
  ultimoFato = 'falha';
}

/**
 * A network operation succeeded: clears the offline flag, and — when the
 * app was showing it — fires the connectivity listeners (UI refresh +
 * queue replay). The belt-and-suspenders trigger: replay also happens on
 * the next successful streamChat even if no network event arrived.
 */
export function marcarSucessoRede(): void {
  const estavaOffline = ultimoFato === 'falha';
  ultimoFato = 'sucesso';
  if (estavaOffline) notificarConectou();
}

// ─────────────────────────────────────────────
// Subscriptions + the replay trigger
// ─────────────────────────────────────────────

/** Subscribes to "connectivity returned" (see the header). Unsubscribes. */
export function quandoConectar(callback: () => void): () => void {
  ouvintes.add(callback);
  return () => {
    ouvintes.delete(callback);
  };
}

type Ouvinte = () => void;
const ouvintes = new Set<Ouvinte>();

let reprocessando = false;
let reprocessador: (() => void | Promise<void>) | null = null;

/** The replay coordinator registers here (module-level, no UI involved). */
export function registrarReprocessador(fn: (() => void | Promise<void>) | null): void {
  reprocessador = fn;
}

function notificarConectou(): void {
  for (const cb of [...ouvintes]) {
    try {
      cb();
    } catch (err) {
      console.warn('[offline] listener de conexão falhou:', err);
    }
  }
  tentarReprocessarFila();
}

/**
 * Kicks the replay coordinator, if any — single-flight (a replay already
 * running is never re-entered). Fire-and-forget on purpose: the
 * coordinator owns its errors.
 */
export function tentarReprocessarFila(): void {
  if (reprocessador === null || reprocessando) return;
  const fn = reprocessador;
  reprocessando = true;
  Promise.resolve()
    .then(() => fn())
    .catch((err) => {
      console.error('[offline] replay da fila falhou:', err);
    })
    .finally(() => {
      reprocessando = false;
    });
}

// ─────────────────────────────────────────────
// The expo-network subscription (module-level, from the first frame)
// ─────────────────────────────────────────────

function aoMudarEstado(state: {
  isConnected?: boolean | null;
  isInternetReachable?: boolean | null;
}): void {
  const online = state.isConnected !== false && state.isInternetReachable !== false;
  // The radio says "online" AND the app was showing the offline state:
  // the listeners fire (UI) and the replay is attempted (the queue).
  if (online && usandoCache()) notificarConectou();
}

let assinado = false;
function garantirAssinatura(): void {
  if (assinado) return;
  assinado = true;
  try {
    addNetworkStateListener((state) => aoMudarEstado(state));
  } catch (err) {
    // Listener API unavailable (e.g. the jest mock of expo-network):
    // the successful-operation trigger (marcarSucessoRede) still drives
    // the replay — the documented fallback.
    console.warn(
      '[offline] expo-network indisponível; o replay depende das operações bem-sucedidas:',
      err,
    );
  }
}

garantirAssinatura();
