/**
 * lib/offline tests (P9 light offline): the last-operation flag
 * (`usandoCache`), the connectivity subscription (`quandoConectar`),
 * the offline-detection predicate (`eFalhaDeRede`) and the replay
 * trigger — both paths: the fake expo-network offline→online event and
 * the successful-operation fallback (the fetch itself proves the
 * connectivity when the event infrastructure is unavailable).
 *
 * `expo-network` is mocked with a listener-set factory (the jest-expo
 * auto-mock exposes no event surface). `lib/api` is REAL here: the
 * `eFalhaDeRede` contract is about the real ChatApiError class.
 */

/**
 * Scriptable fake of expo-network (hoisted function declaration named
 * `mock*` so the hoisted jest.mock factory may call it).
 */
function mockExpoNetwork() {
  type Estado = { isConnected?: boolean | null; isInternetReachable?: boolean | null };
  const listeners = new Set<(s: Estado) => void>();
  return {
    addNetworkStateListener: jest.fn((cb: (s: Estado) => void) => {
      listeners.add(cb);
      return { remove: () => listeners.delete(cb) };
    }),
    /** Test handle: fire a state change at every registered listener. */
    __fire: (state: Estado) => {
      for (const l of [...listeners]) l(state);
    },
  };
}

jest.mock('expo-network', () => mockExpoNetwork());

import {
  eFalhaDeRede,
  marcarFalhaRede,
  marcarSucessoRede,
  quandoConectar,
  registrarReprocessador,
  usandoCache,
} from '../../lib/offline';
import { ChatApiError } from '../../lib/api';

/** Fires the fake expo-network event at the listeners lib/offline registered. */
function fireEstado(estado: { isConnected?: boolean | null; isInternetReachable?: boolean | null }) {
  const mod = require('expo-network') as {
    __fire: (s: { isConnected?: boolean | null; isInternetReachable?: boolean | null }) => void;
  };
  mod.__fire(estado);
}

const tick = () => new Promise<void>((r) => setTimeout(r, 0));

beforeEach(() => {
  // No reprocessor by default; the flag starts "last op succeeded".
  registrarReprocessador(null);
  marcarSucessoRede();
});

// ─────────────────────────────────────────────
// eFalhaDeRede — the offline-detection predicate
// ─────────────────────────────────────────────

describe('eFalhaDeRede', () => {
  const sinal = () => new AbortController().signal;

  it('a TypeError (fetch: no response at all) IS a network failure', () => {
    expect(eFalhaDeRede(new TypeError('Network request failed'), sinal())).toBe(true);
    expect(eFalhaDeRede(new TypeError('fetch failed'), sinal())).toBe(true);
  });

  it('a ChatApiError (the server ANSWERED) is NEVER a network failure', () => {
    expect(eFalhaDeRede(new ChatApiError('muitas pessoas', 429, 30), sinal())).toBe(false);
    expect(eFalhaDeRede(new ChatApiError('Sua sessão expirou', 401, null), sinal())).toBe(false);
    expect(eFalhaDeRede(new ChatApiError('pergunta vazia', 400, null), sinal())).toBe(false);
    expect(eFalhaDeRede(new ChatApiError('boom', 500, null), sinal())).toBe(false);
  });

  it('an aborted signal (the Stop button) is not a network failure', () => {
    const c = new AbortController();
    c.abort();
    expect(eFalhaDeRede(new TypeError('Network request failed'), c.signal)).toBe(false);
  });

  it('the no-token fast-fail is a session problem, not connectivity', () => {
    expect(eFalhaDeRede(new Error('Sua sessão expirou'), sinal())).toBe(false);
  });

  it('a generic server-side error is not connectivity either', () => {
    expect(eFalhaDeRede(new Error('Não consegui falar com o USPapo agora.'), sinal())).toBe(false);
  });
});

// ─────────────────────────────────────────────
// usandoCache — the last-operation flag
// ─────────────────────────────────────────────

describe('usandoCache', () => {
  it('starts false, flips on marcarFalhaRede, clears on marcarSucessoRede', () => {
    expect(usandoCache()).toBe(false);
    marcarFalhaRede();
    expect(usandoCache()).toBe(true);
    marcarSucessoRede();
    expect(usandoCache()).toBe(false);
  });

  it('a successful operation fires the listeners ONLY on the falha→sucesso transition', () => {
    const cb = jest.fn();
    const cancelar = quandoConectar(cb);

    marcarFalhaRede();
    marcarSucessoRede();
    expect(cb).toHaveBeenCalledTimes(1);

    marcarSucessoRede(); // still online: not a transition
    expect(cb).toHaveBeenCalledTimes(1);

    cancelar();
    marcarFalhaRede();
    marcarSucessoRede();
    expect(cb).toHaveBeenCalledTimes(1); // unsubscribed
  });
});

// ─────────────────────────────────────────────
// The replay trigger (both connectivity modes)
// ─────────────────────────────────────────────

describe('replay trigger', () => {
  it('the expo-network offline→online event triggers the registered reprocessor', async () => {
    const replay = jest.fn(async () => undefined);
    registrarReprocessador(replay);
    marcarFalhaRede(); // the app is showing the offline state

    fireEstado({ isConnected: true, isInternetReachable: true });
    await tick();

    expect(replay).toHaveBeenCalledTimes(1);
  });

  it('a network event while NOT offline does not trigger the replay', async () => {
    const replay = jest.fn(async () => undefined);
    registrarReprocessador(replay);
    marcarSucessoRede(); // the last op succeeded: not offline

    fireEstado({ isConnected: true, isInternetReachable: true });
    await tick();

    expect(replay).toHaveBeenCalledTimes(0);
  });

  it('the event does NOT clear the flag by itself — only a successful operation does', async () => {
    registrarReprocessador(jest.fn(async () => undefined));
    marcarFalhaRede();
    fireEstado({ isConnected: true, isInternetReachable: true });
    await tick();
    expect(usandoCache()).toBe(true); // the backend may still be down

    marcarSucessoRede(); // the replay's first success clears it
    expect(usandoCache()).toBe(false);
  });

  it('the replay trigger is single-flight (a running replay is never re-entered)', async () => {
    let resolver: () => void = () => undefined;
    const replay = jest.fn(
      () =>
        new Promise<void>((r) => {
          resolver = r;
        }),
    );
    registrarReprocessador(replay);
    marcarFalhaRede();

    fireEstado({ isConnected: true, isInternetReachable: true });
    fireEstado({ isConnected: true, isInternetReachable: true }); // the radio flaps
    await tick();

    expect(replay).toHaveBeenCalledTimes(1);
    resolver();
    await tick();

    // Once the replay finished, the next trigger runs it again.
    marcarFalhaRede();
    fireEstado({ isConnected: true, isInternetReachable: true });
    await tick();
    expect(replay).toHaveBeenCalledTimes(2);
  });
});
