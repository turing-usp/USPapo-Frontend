/**
 * Offline queue tests (P9 light offline):
 *
 * - enqueue on a network error (the fake streamChat rejects with a
 *   TypeError — "the fake fetch");
 * - persistence (the queue lives on the SAME storage backend as the
 *   conversation cache — the fake in-memory BancoOffline is the "fake
 *   storage" of the seam);
 * - replay IN ORDER (reprocessarFila + the fake connectivity trigger);
 * - 429/401 (the server answered) are NEVER enqueued.
 *
 * lib/api, lib/conversations, lib/supabase and lib/haptics are mocked
 * (no network, every event scripted); lib/cache, lib/net and lib/offline
 * are the REAL modules, with the storage swapped for the fake.
 */

function mockExpoNetwork() {
  type Estado = { isConnected?: boolean | null; isInternetReachable?: boolean | null };
  const listeners = new Set<(s: Estado) => void>();
  return {
    addNetworkStateListener: jest.fn((cb: (s: Estado) => void) => {
      listeners.add(cb);
      return { remove: () => listeners.delete(cb) };
    }),
    __fire: (state: Estado) => {
      for (const l of [...listeners]) l(state);
    },
  };
}
jest.mock('expo-network', () => mockExpoNetwork());

jest.mock('../../lib/api', () => {
  /** Structural clone of lib/api's ChatApiError (IN the factory, so the
   *  SUT and the tests share one class and `instanceof` stays consistent). */
  class ChatApiError extends Error {
    readonly status: number;
    readonly retryAfter: number | null;
    constructor(message: string, status: number, retryAfter: number | null) {
      super(message);
      this.name = 'ChatApiError';
      this.status = status;
      this.retryAfter = retryAfter;
    }
  }
  const ROTULOS: Record<string, string> = {};
  return {
    ChatApiError,
    streamChat: jest.fn(),
    TOOL_LABELS: ROTULOS,
    labelDaFerramenta: (name: string) => ROTULOS[name] ?? name,
  };
});

jest.mock('../../lib/conversations', () => ({
  anexarMensagem: jest.fn(async () => undefined),
  anexarTurno: jest.fn(async () => undefined),
  lerConversa: jest.fn(async () => null),
  lerHistorico: jest.fn(async () => []),
}));

jest.mock('../../lib/supabase', () => ({
  supabase: {
    auth: {
      getSession: jest.fn(async () => ({
        data: { session: { user: { id: 'u-1' }, access_token: 'tok-123' } },
      })),
    },
  },
}));

jest.mock('../../lib/haptics', () => ({
  haptics: {
    send: jest.fn(async () => undefined),
    like: jest.fn(async () => undefined),
    dislike: jest.fn(async () => undefined),
    error: jest.fn(async () => undefined),
    finished: jest.fn(async () => undefined),
    favorite: jest.fn(async () => undefined),
  },
}));

import { ChatApiError, streamChat } from '../../lib/api';
import type { ChatEvent, ChatRequest } from '../../lib/api';
import { configurarBanco, conversaPorIdOffline, salvarConversa, type BancoOffline } from '../../lib/cache';
import { anexarMensagem, lerConversa } from '../../lib/conversations';
import { filaPendente, queue } from '../../lib/net';
import { marcarFalhaRede, usandoCache } from '../../lib/offline';
import { supabase } from '../../lib/supabase';
import {
  executarResposta,
  reprocessarFila,
  tratarFalhaDeRede,
  type OpcoesResposta,
} from '../../app/(main)/chat/useChat';

// ─────────────────────────────────────────────
// Fakes
// ─────────────────────────────────────────────

type QueueItem = {
  id: string;
  conversationId: string;
  question: string;
  enqueuedAt: number;
  turno?: number;
};

type Store = {
  conversas: Map<string, { user_id: string; id: string; pergunta: string; resposta: string | null; criada_em: string; atualizada_em: string; favorita: boolean }>;
  fila: QueueItem[];
  chamadas: string[];
};

function fakeBanco(): { banco: BancoOffline; store: Store } {
  const store: Store = { conversas: new Map(), fila: [], chamadas: [] };
  const chave = (u: string, i: string) => `${u}:${i}`;
  const semUser = (c: { user_id: string; id: string; pergunta: string; resposta: string | null; criada_em: string; atualizada_em: string; favorita: boolean }) => ({
    id: c.id,
    titulo: '',
    // A conversation is a list of turns; the fake keeps one.
    mensagens: [
      { ordem: 0, pergunta: c.pergunta, resposta: c.resposta, fontes: [] },
    ],
    fontes: [],
    pergunta: c.pergunta,
    resposta: c.resposta,
    criada_em: c.criada_em,
    atualizada_em: c.atualizada_em,
    favorita: c.favorita,
  });

  const banco: BancoOffline = {
    async salvarConversa(c) {
      store.chamadas.push('salvarConversa');
      store.conversas.set(chave(c.user_id, c.id), { ...c });
    },
    async historico(userId) {
      return [...store.conversas.values()]
        .filter((c) => c.user_id === userId)
        .map(semUser)
        .sort((a, b) => (b.atualizada_em ?? '').localeCompare(a.atualizada_em ?? ''));
    },
    async ultimas(userId, n) {
      return (await banco.historico(userId)).slice(0, n);
    },
    async conversaPorId(userId, id) {
      const c = store.conversas.get(chave(userId, id));
      return c ? semUser(c) : null;
    },
    async tamanho(userId) {
      return [...store.conversas.values()].filter(
        (c) => userId === undefined || c.user_id === userId,
      ).length;
    },
    async limpar() {
      store.conversas.clear();
    },
    async filaListar() {
      return store.fila.map((i) => ({ ...i }));
    },
    async filaInserir(item, naFrente) {
      store.chamadas.push('filaInserir');
      if (naFrente) store.fila.unshift({ ...item });
      else store.fila.push({ ...item });
    },
    async filaRemover(id) {
      store.fila = store.fila.filter((i) => i.id !== id);
    },
    async filaLimpar() {
      store.fila = [];
    },
  };
  return { banco, store };
}

const streamChatFake = streamChat as unknown as jest.Mock<
  AsyncGenerator<ChatEvent, void, unknown>,
  [ChatRequest]
>;
const anexarFake = anexarMensagem as unknown as jest.Mock<void, unknown[]>;
const lerFake = lerConversa as unknown as jest.Mock<unknown, unknown[]>;
const sessaoFake = supabase.auth.getSession as unknown as jest.Mock<
  { data: { session: { user: { id: string }; access_token: string } | null } },
  []
>;

let store: Store;

/** The happy-path events for one scripted answer. */
function responder(texto: string): ChatEvent[] {
  return [{ type: 'text', delta: texto }, { type: 'end' }];
}

function basico(over: Partial<{ signal: AbortSignal; sessionId: string }> = {}): OpcoesResposta {
  return {
    userId: 'u-1',
    pergunta: 'Qual o cardápio de hoje?',
    historico: [],
    sessionId: over.sessionId ?? 'c-net',
    token: 'tok-123',
    signal: over.signal ?? new AbortController().signal,
  };
}

function enfileirar(conversationId: string, question: string): QueueItem {
  return { id: conversationId, conversationId, question, enqueuedAt: Date.now() };
}

const tick = () => new Promise<void>((r) => setTimeout(r, 0));

async function esperar(cond: () => Promise<boolean>, timeoutMs = 2000): Promise<void> {
  const fim = Date.now() + timeoutMs;
  while (Date.now() < fim) {
    if (await cond()) return;
    await new Promise((r) => setTimeout(r, 10));
  }
  throw new Error('timeout esperando a condição');
}

beforeEach(() => {
  const fake = fakeBanco();
  store = fake.store;
  configurarBanco(fake.banco);
  streamChatFake.mock.calls.length = 0;
  streamChatFake.mockImplementation(async function* () {
    return;
  });
  anexarFake.mock.calls.length = 0;
  lerFake.mock.calls.length = 0;
  lerFake.mockImplementation(async () => null);
  sessaoFake.mock.calls.length = 0;
  sessaoFake.mockImplementation(async () => ({
    data: { session: { user: { id: 'u-1' }, access_token: 'tok-123' } },
  }));
});

afterEach(() => {
  // Normalize: empty the fake storage (no leftovers for the next test) and
  // leave the offline flag armed, so the next test's transition (if any)
  // fires a no-op replay against an empty queue.
  store.fila = [];
  store.conversas.clear();
  marcarFalhaRede();
  return tick();
});

// ─────────────────────────────────────────────
// Enqueue on a network error (the fake fetch rejects with a TypeError)
// ─────────────────────────────────────────────

describe('enqueue on network error', () => {
  it('a TypeError from the stream → falhaDeRede=true and tratarFalhaDeRede queues it', async () => {
    streamChatFake.mockImplementation(async function* () {
      throw new TypeError('Network request failed');
    });

    const r = await executarResposta(basico());
    expect(r.ok).toBe(false);
    if (r.ok) return;
    expect(r.falhaDeRede).toBe(true); // the offline gate
    expect(r.erro.tipo).toBe('outro');

    // The hook's offline branch (disparar) calls exactly this:
    await tratarFalhaDeRede('u-1', 'c-net', 'Qual o cardápio de hoje?');

    expect(usandoCache()).toBe(true); // the honest offline state is armed
    const fila = await filaPendente();
    expect(fila).toHaveLength(1);
    expect(fila[0].conversationId).toBe('c-net');
    expect(fila[0].question).toBe('Qual o cardápio de hoje?');
    expect(typeof fila[0].enqueuedAt).toBe('number');

    // The pending row is in the offline cache (resposta null = pending)
    // so the history screen renders it with no network.
    const cache = await conversaPorIdOffline('u-1', 'c-net');
    expect(cache?.resposta).toBeNull();
    expect(cache?.pergunta).toBe('Qual o cardápio de hoje?');
  });

  it('a 429 (the server answered) is NOT a network failure → NOT enqueued', async () => {
    streamChatFake.mockImplementation(async function* () {
      throw new ChatApiError('muitas pessoas', 429, 30);
    });
    const r = await executarResposta(basico());
    expect(r.ok).toBe(false);
    if (r.ok) return;
    expect(r.falhaDeRede).toBe(false);
    expect(r.erro.tipo).toBe('limite');
    expect(await filaPendente()).toHaveLength(0);
  });

  it('a 401 (the server answered) is NOT a network failure → NOT enqueued', async () => {
    streamChatFake.mockImplementation(async function* () {
      throw new ChatApiError('Sua sessão expirou', 401, null);
    });
    const r = await executarResposta(basico());
    expect(r.ok).toBe(false);
    if (r.ok) return;
    expect(r.falhaDeRede).toBe(false);
    expect(r.erro.tipo).toBe('sessao');
    expect(await filaPendente()).toHaveLength(0);
  });
});

// ─────────────────────────────────────────────
// Persistence (fake storage) + de-dup
// ─────────────────────────────────────────────

describe('persistence', () => {
  it('the queue is persisted on the storage seam (the same backend as the cache)', async () => {
    await queue.enqueue(enfileirar('c-p', 'P?'));

    // The data lives in the backend store — NOT in the queue module's
    // memory (the queue has none): an app restart loses the modules, not
    // the store.
    expect(store.fila).toHaveLength(1);
    expect(store.chamadas).toContain('filaInserir');
    expect(store.conversas.size).toBe(0); // the cache and the queue share the backend

    expect(await filaPendente()).toHaveLength(1);
    expect((await queue.pending())[0].question).toBe('P?');

    // Dequeue removes it from the store.
    const item = await queue.dequeue();
    expect(item?.question).toBe('P?');
    expect(store.fila).toHaveLength(0);
    expect(await queue.dequeue()).toBeNull();
  });

  it('enqueue de-duplicates by conversationId (latest text wins, one item)', async () => {
    await queue.enqueue(enfileirar('c-d', 'texto antigo'));
    await queue.enqueue(enfileirar('c-d', 'texto novo'));
    const fila = await filaPendente();
    expect(fila).toHaveLength(1);
    expect(fila[0].question).toBe('texto novo');
  });
});

// ─────────────────────────────────────────────
// Replay (reprocessarFila)
// ─────────────────────────────────────────────

describe('replay', () => {
  it('reprocessarFila replays the queued items IN ORDER through the send path', async () => {
    await queue.enqueue(enfileirar('c-a', 'P-A'));
    await queue.enqueue(enfileirar('c-b', 'P-B'));
    await queue.enqueue(enfileirar('c-c', 'P-C'));

    const enviadas: string[] = [];
    streamChatFake.mockImplementation(async function* (req: ChatRequest) {
      enviadas.push(req.question);
      yield* responder(`resposta ${req.question}`);
    });

    await reprocessarFila();

    expect(enviadas).toEqual(['P-A', 'P-B', 'P-C']);
    expect(await filaPendente()).toHaveLength(0);

    // Each answer was persisted via the P9 completion call, in order.
    const completions = anexarFake.mock.calls.filter(
      (c) => (c[2] as { resposta?: string }).resposta !== undefined,
    );
    expect(
      completions.map((c) => [c[1], (c[2] as { resposta?: string }).resposta]),
    ).toEqual([
      ['c-a', 'resposta P-A'],
      ['c-b', 'resposta P-B'],
      ['c-c', 'resposta P-C'],
    ]);
    // And cached (the history screen renders it offline).
    expect((await conversaPorIdOffline('u-1', 'c-b'))?.resposta).toBe('resposta P-B');
  });

  it('a 429 mid-replay: the item goes back to the FRONT and the replay stops (order kept)', async () => {
    await queue.enqueue(enfileirar('c-a', 'P-A'));
    await queue.enqueue(enfileirar('c-b', 'P-B'));
    await queue.enqueue(enfileirar('c-c', 'P-C'));

    const enviadas: string[] = [];
    streamChatFake.mockImplementation(async function* (req: ChatRequest) {
      enviadas.push(req.question);
      if (req.question === 'P-B') {
        throw new ChatApiError('muitas pessoas', 429, 60);
      }
      yield* responder(`resposta ${req.question}`);
    });

    await reprocessarFila();

    expect(enviadas).toEqual(['P-A', 'P-B']); // P-C was never processed
    const fila = await filaPendente();
    expect(fila.map((i) => i.conversationId)).toEqual(['c-b', 'c-c']); // b back at the front
  });

  it('a network failure mid-replay: back to the front + the offline flag re-armed', async () => {
    await queue.enqueue(enfileirar('c-a', 'P-A'));
    await queue.enqueue(enfileirar('c-b', 'P-B'));
    await queue.enqueue(enfileirar('c-c', 'P-C'));

    const enviadas: string[] = [];
    streamChatFake.mockImplementation(async function* (req: ChatRequest) {
      enviadas.push(req.question);
      if (req.question === 'P-B') {
        throw new TypeError('Network request failed');
      }
      yield* responder(`resposta ${req.question}`);
    });

    await reprocessarFila();

    expect(enviadas).toEqual(['P-A', 'P-B']);
    const fila = await filaPendente();
    expect(fila.map((i) => i.conversationId)).toEqual(['c-b', 'c-c']);
    expect(usandoCache()).toBe(true); // the failure re-armed the flag
  });

  it('replay skips a conversation that already has a saved resposta', async () => {
    await queue.enqueue(enfileirar('c-a', 'P-A'));
    await queue.enqueue(enfileirar('c-b', 'P-B'));
    lerFake.mockImplementation(async (_u: unknown, id: unknown) =>
      id === 'c-a'
        ? {
            id: 'c-a',
            titulo: '',
            mensagens: [
              { ordem: 0, pergunta: 'P-A', resposta: 'já foi respondida', fontes: [] },
            ],
            fontes: [],
            pergunta: 'P-A',
            resposta: 'já foi respondida',
            criada_em: '2026-09-19T12:00:00.000Z',
            atualizada_em: '2026-09-19T12:00:00.000Z',
            favorita: false,
          }
        : null,
    );

    const enviadas: string[] = [];
    streamChatFake.mockImplementation(async function* (req: ChatRequest) {
      enviadas.push(req.question);
      yield* responder(`resposta ${req.question}`);
    });

    await reprocessarFila();

    expect(enviadas).toEqual(['P-B']);
    expect(await filaPendente()).toHaveLength(0);
  });

  it('the "already answered" check falls back to the CACHE when the server is unreachable', async () => {
    await queue.enqueue(enfileirar('c-a', 'P-A'));
    await queue.enqueue(enfileirar('c-b', 'P-B'));
    await salvarConversa({
      id: 'c-a',
      titulo: '',
      mensagens: [
        { ordem: 0, pergunta: 'P-A', resposta: 'resposta no cache', fontes: [] },
      ],
      fontes: [],
      user_id: 'u-1',
      pergunta: 'P-A',
      resposta: 'resposta no cache',
      criada_em: '2026-09-19T12:00:00.000Z',
      atualizada_em: '2026-09-19T12:00:00.000Z',
      favorita: false,
    });
    lerFake.mockImplementation(async () => {
      throw new Error('supabase down');
    });

    const enviadas: string[] = [];
    streamChatFake.mockImplementation(async function* (req: ChatRequest) {
      enviadas.push(req.question);
      yield* responder(`resposta ${req.question}`);
    });

    await reprocessarFila();

    expect(enviadas).toEqual(['P-B']);
    expect(await filaPendente()).toHaveLength(0);
  });

  it('no session: the item waits at the front and nothing is sent', async () => {
    await queue.enqueue(enfileirar('c-a', 'P-A'));
    sessaoFake.mockImplementation(async () => ({ data: { session: null } }));

    await reprocessarFila();

    expect(streamChatFake).not.toHaveBeenCalled();
    expect(await filaPendente()).toHaveLength(1);
  });

  it('an empty queue: the replay is a no-op', async () => {
    await reprocessarFila();
    expect(streamChatFake).not.toHaveBeenCalled();
    expect(await filaPendente()).toHaveLength(0);
  });
});

// ─────────────────────────────────────────────
// The fake connectivity trigger (offline→online event)
// ─────────────────────────────────────────────

describe('connectivity trigger', () => {
  it('the offline→online event drains the queue IN ORDER (the documented trigger)', async () => {
    await queue.enqueue(enfileirar('c-a', 'P-A'));
    await queue.enqueue(enfileirar('c-b', 'P-B'));
    marcarFalhaRede(); // the app is showing the offline state

    const enviadas: string[] = [];
    streamChatFake.mockImplementation(async function* (req: ChatRequest) {
      enviadas.push(req.question);
      yield* responder(`resposta ${req.question}`);
    });

    // The fake expo-network event (the real app gets it from the device):
    const mod = require('expo-network') as {
      __fire: (s: { isConnected?: boolean | null; isInternetReachable?: boolean | null }) => void;
    };
    mod.__fire({ isConnected: true, isInternetReachable: true });

    await esperar(async () => (await filaPendente()).length === 0);
    expect(enviadas).toEqual(['P-A', 'P-B']);

    // The replay's success cleared the offline flag.
    expect(usandoCache()).toBe(false);
  });

  it('an offline event (isConnected=false) does NOT drain the queue', async () => {
    await queue.enqueue(enfileirar('c-a', 'P-A'));
    marcarFalhaRede();

    const mod = require('expo-network') as {
      __fire: (s: { isConnected?: boolean | null; isInternetReachable?: boolean | null }) => void;
    };
    mod.__fire({ isConnected: false, isInternetReachable: false });
    await tick();

    expect(streamChatFake).not.toHaveBeenCalled();
    expect(await filaPendente()).toHaveLength(1);
  });
});
