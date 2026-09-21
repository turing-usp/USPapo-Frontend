/**
 * lib/cache tests (P9 light offline), against a FAKE in-memory
 * `BancoOffline` (the "fake storage" of the seam): the public API
 * (salvarConversa / carregarHistoricoOffline / limpar / tamanho) and the
 * pure `fundirHistorico` merge (the history screen's rule).
 *
 * The default SQLite backend (expo-sqlite) is NOT exercised here: the jest
 * environment has no native SQLite driver (expo-sqlite is auto-mocked by
 * jest-expo), and the seam — `configurarBanco` — is the contract: the
 * public API behaves identically on any driver.
 */
import {
  carregarHistoricoOffline,
  configurarBanco,
  conversaPorIdOffline,
  fundirHistorico,
  limpar,
  removerConversa,
  salvarConversa,
  salvarConversas,
  tamanho,
  ultimasConversasOffline,
  type BancoOffline,
  type ConversaCacheada,
} from '../../lib/cache';
import type { Conversa } from '../../lib/conversations';
import type { QueueItem } from '../../lib/net';

// ─────────────────────────────────────────────
// The fake storage (in-memory, behind the seam)
// ─────────────────────────────────────────────

type Store = {
  conversas: Map<string, ConversaCacheada>;
  fila: QueueItem[];
  chamadas: string[];
};

function fakeBanco(): { banco: BancoOffline; store: Store } {
  const store: Store = { conversas: new Map(), fila: [], chamadas: [] };
  const chave = (u: string, i: string) => `${u}:${i}`;
  const semUser = (c: ConversaCacheada): Conversa => ({
    id: c.id,
    titulo: c.titulo,
    mensagens: c.mensagens,
    fontes: c.fontes,
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
      store.chamadas.push('historico');
      return [...store.conversas.values()]
        .filter((c) => c.user_id === userId)
        .map(semUser)
        .sort((a, b) => (b.atualizada_em ?? '').localeCompare(a.atualizada_em ?? ''));
    },
    async ultimas(userId, n) {
      return (await banco.historico(userId)).slice(0, n);
    },
    async removerConversa(userId, id) {
      store.chamadas.push('removerConversa');
      store.conversas.delete(chave(userId, id));
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
      store.chamadas.push('limpar');
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

let store: Store;

beforeEach(() => {
  const fake = fakeBanco();
  store = fake.store;
  configurarBanco(fake.banco);
});

function conversa(
  id: string,
  over: Partial<Conversa> & { user_id?: string } = {},
): ConversaCacheada {
  const pergunta = over.pergunta ?? `pergunta ${id}`;
  const resposta = over.resposta === undefined ? `resposta ${id}` : over.resposta;
  return {
    id,
    titulo: over.titulo ?? '',
    // A conversation is a LIST of turns (lib/conversations); these fixtures
    // keep one, which is what the derived pergunta/resposta below describe.
    mensagens: over.mensagens ?? [
      { ordem: 0, pergunta, resposta, fontes: over.fontes ?? [] },
    ],
    fontes: over.fontes ?? [],
    pergunta,
    resposta,
    criada_em: over.criada_em ?? '2026-09-19T12:00:00.000Z',
    atualizada_em: over.atualizada_em ?? '2026-09-19T12:00:00.000Z',
    favorita: over.favorita ?? false,
    user_id: over.user_id ?? 'u-1',
  };
}

// ─────────────────────────────────────────────
// salvarConversa / carregarHistoricoOffline — the round-trip
// ─────────────────────────────────────────────

describe('round-trip', () => {
  it('save/load preserves the row — including a pending (resposta null)', async () => {
    await salvarConversa(conversa('c-1', { resposta: null, favorita: true }));

    const [c] = await carregarHistoricoOffline('u-1');
    expect(c).toEqual({
      id: 'c-1',
      titulo: '',
      mensagens: [
        { ordem: 0, pergunta: 'pergunta c-1', resposta: null, fontes: [] },
      ],
      fontes: [],
      pergunta: 'pergunta c-1',
      resposta: null,
      criada_em: '2026-09-19T12:00:00.000Z',
      atualizada_em: '2026-09-19T12:00:00.000Z',
      favorita: true,
    });
    // No user_id leaks into the Conversa shape.
    expect((c as Record<string, unknown>).user_id === undefined).toBe(true);
  });

  it('saving again upserts (last write wins, one row per id)', async () => {
    await salvarConversa(conversa('c-1', { resposta: null }));
    await salvarConversa(
      conversa('c-1', {
        resposta: 'resposta final',
        atualizada_em: '2026-09-19T12:01:00.000Z',
      }),
    );

    const historico = await carregarHistoricoOffline('u-1');
    expect(historico).toHaveLength(1);
    expect(historico[0].resposta).toBe('resposta final');
    expect(historico[0].atualizada_em).toBe('2026-09-19T12:01:00.000Z');
  });

  it('the history is newest atualizada_em first', async () => {
    await salvarConversa(conversa('c-antiga', { atualizada_em: '2026-09-17T00:00:00.000Z' }));
    await salvarConversa(conversa('c-2', { atualizada_em: '2026-09-18T00:00:00.000Z' }));
    await salvarConversa(conversa('c-3', { atualizada_em: '2026-09-19T00:00:00.000Z' }));

    expect((await carregarHistoricoOffline('u-1')).map((c) => c.id)).toEqual([
      'c-3',
      'c-2',
      'c-antiga',
    ]);
  });

  it('a user only sees their own rows', async () => {
    await salvarConversa(conversa('c-mine'));
    await salvarConversa(conversa('c-theirs', { user_id: 'u-outro' }));

    const minhas = await carregarHistoricoOffline('u-1');
    expect(minhas.map((c) => c.id)).toEqual(['c-mine']);
    const dele = await carregarHistoricoOffline('u-outro');
    expect(dele.map((c) => c.id)).toEqual(['c-theirs']);
  });
});

// ─────────────────────────────────────────────
// ultimas / conversaPorId / tamanho / limpar
// ─────────────────────────────────────────────

describe('accessors', () => {
  beforeEach(async () => {
    for (const [id, quando] of [
      ['c-1', '2026-09-19T00:00:00.000Z'],
      ['c-2', '2026-09-19T01:00:00.000Z'],
      ['c-3', '2026-09-19T02:00:00.000Z'],
      ['c-4', '2026-09-19T03:00:00.000Z'],
    ] as const) {
      await salvarConversa(conversa(id, { atualizada_em: quando }));
    }
  });

  it('ultimas returns the last N (newest first, default 3 via the caller)', async () => {
    expect((await ultimasConversasOffline('u-1', 2)).map((c) => c.id)).toEqual([
      'c-4',
      'c-3',
    ]);
  });

  it('conversaPorId finds the row (or null)', async () => {
    const achada = await conversaPorIdOffline('u-1', 'c-3');
    expect(achada?.id).toBe('c-3');
    expect(await conversaPorIdOffline('u-1', 'inexistente')).toBeNull();
    // Another user's row with the same id is NOT this user's row.
    await salvarConversa(conversa('c-3', { user_id: 'u-outro' }));
    expect(await conversaPorIdOffline('u-1', 'c-3')).not.toBeNull();
  });

  it('tamanho counts the cached rows', async () => {
    expect(await tamanho()).toBe(4);
  });

  it('limpar drops the whole cache', async () => {
    await limpar();
    expect(await tamanho()).toBe(0);
    expect(await carregarHistoricoOffline('u-1')).toEqual([]);
  });

  it('salvarConversas is the bulk write-through (the history screen)', async () => {
    await limpar();
    await salvarConversas('u-1', [
      { id: 'b-1', titulo: '', mensagens: [{ ordem: 0, pergunta: 'p1', resposta: 'r1', fontes: [] }], fontes: [], pergunta: 'p1', resposta: 'r1', criada_em: 'a', atualizada_em: '2026-09-19T00:00:00.000Z', favorita: false },
      { id: 'b-2', titulo: '', mensagens: [{ ordem: 0, pergunta: 'p2', resposta: null, fontes: [] }], fontes: [], pergunta: 'p2', resposta: null, criada_em: 'a', atualizada_em: '2026-09-19T01:00:00.000Z', favorita: true },
    ]);
    expect(await tamanho()).toBe(2);
    const [b2, b1] = await carregarHistoricoOffline('u-1');
    expect(b2.id).toBe('b-2'); // newest first
    expect(b2.resposta).toBeNull(); // the pending row kept its null
    expect(b2.favorita).toBe(true);
    expect(b1.resposta).toBe('r1');
  });
});

// ─────────────────────────────────────────────
// fundirHistorico — the history merge (the jest contract)
// ─────────────────────────────────────────────

describe('fundirHistorico', () => {
  const C1: Conversa = {
    id: 'c-1',
    titulo: '',
    mensagens: [{ ordem: 0, pergunta: 'P1', resposta: 'cache r1', fontes: [] }],
    fontes: [],
    pergunta: 'P1',
    resposta: 'cache r1',
    criada_em: '2026-09-19T10:00:00.000Z',
    atualizada_em: '2026-09-19T10:00:00.000Z',
    favorita: false,
  };
  const C2: Conversa = {
    id: 'c-2',
    titulo: '',
    mensagens: [{ ordem: 0, pergunta: 'P2', resposta: 'cache r2', fontes: [] }],
    fontes: [],
    pergunta: 'P2',
    resposta: 'cache r2',
    criada_em: '2026-09-19T11:00:00.000Z',
    atualizada_em: '2026-09-19T11:00:00.000Z',
    favorita: false,
  };

  it('Supabase down (no server rows) → the cache only', () => {
    expect(fundirHistorico([], [C1, C2])).toEqual([C2, C1]);
    expect(fundirHistorico([], [])).toEqual([]);
  });

  it('both up → the server wins per row when its atualizada_em is >= the cache\'s', () => {
    // c-1: the server is strictly newer → the server row wins.
    const serverNovo: Conversa = {
      ...C1,
      resposta: 'servidor mais novo',
      atualizada_em: '2026-09-19T12:00:00.000Z',
    };
    // c-2: the server timestamp TIES the cache's → the server wins the tie.
    const serverEmpate: Conversa = { ...C2, resposta: 'servidor empate' };
    const fundido = fundirHistorico([serverNovo, serverEmpate], [C1, C2]);
    expect(fundido).toHaveLength(2);
    expect(fundido.find((c) => c.id === 'c-1')?.resposta).toBe('servidor mais novo');
    expect(fundido.find((c) => c.id === 'c-2')?.resposta).toBe('servidor empate');
  });

  it('the cache wins ONLY when strictly newer (an offline completion)', () => {
    const cacheNova: Conversa = {
      ...C1,
      resposta: 'resposta offline (não sincronizada)',
      atualizada_em: '2026-09-20T00:00:00.000Z',
    };
    const fundido = fundirHistorico([C1], [cacheNova]);
    expect(fundido).toHaveLength(1);
    expect(fundido[0].resposta).toBe('resposta offline (não sincronizada)');
  });

  it('the union keeps ids present in only one side', () => {
    const soServidor: Conversa = {
      id: 's-9',
      titulo: '',
      mensagens: [{ ordem: 0, pergunta: 'P9', resposta: 'r9', fontes: [] }],
      fontes: [],
      pergunta: 'P9',
      resposta: 'r9',
      criada_em: '2026-09-19T09:00:00.000Z',
      atualizada_em: '2026-09-19T09:00:00.000Z',
      favorita: false,
    };
    const fundido = fundirHistorico([soServidor], [C2]);
    expect(fundido.map((c) => c.id).sort()).toEqual(['c-2', 's-9']);
  });

  it('the result is newest first (atualizada_em desc)', () => {
    const fundido = fundirHistorico([], [C1, C2]);
    expect(fundido[0].id).toBe('c-2');
    expect(fundido[1].id).toBe('c-1');
  });
});

// ─────────────────────────────────────────────
// The queue ops on the seam (FIFO + front re-enqueue)
// ─────────────────────────────────────────────

describe('fila (seam level)', () => {
  const item = (id: string, conversationId: string): QueueItem => ({
    id,
    conversationId,
    question: `q-${id}`,
    enqueuedAt: Date.now(),
  });

  it('FIFO order is preserved; the front re-enqueue keeps the order', async () => {
    const { banco } = fakeBanco();
    configurarBanco(banco);
    await banco.filaInserir(item('a', 'c-a'), false);
    await banco.filaInserir(item('b', 'c-b'), false);
    expect((await banco.filaListar()).map((i) => i.id)).toEqual(['a', 'b']);

    await banco.filaRemover('a'); // dequeue the head
    await banco.filaInserir(item('a', 'c-a'), true); // back to the FRONT
    expect((await banco.filaListar()).map((i) => i.id)).toEqual(['a', 'b']);

    await banco.filaLimpar();
    expect(await banco.filaListar()).toEqual([]);
  });
});

// ─────────────────────────────────────────────
// removerConversa — the delete that has to stick
// ─────────────────────────────────────────────

describe('removerConversa', () => {
  it('forgets one row without touching the rest', async () => {
    await salvarConversa(conversa('c-1'));
    await salvarConversa(conversa('c-2'));
    await removerConversa('u-1', 'c-1');

    const restantes = await carregarHistoricoOffline('u-1');
    expect(restantes.map((c) => c.id)).toEqual(['c-2']);
    expect(await conversaPorIdOffline('u-1', 'c-1')).toBeNull();
  });

  it('is scoped to the owner (another user keeps their row)', async () => {
    await salvarConversa(conversa('c-1', { user_id: 'u-1' }));
    await salvarConversa(conversa('c-1', { user_id: 'u-2' }));
    await removerConversa('u-1', 'c-1');

    expect(await conversaPorIdOffline('u-1', 'c-1')).toBeNull();
    expect(await conversaPorIdOffline('u-2', 'c-1')).not.toBeNull();
  });

  it('a deleted row does NOT come back through fundirHistorico', async () => {
    // The bug this exists for: the merge is a UNION, so a conversation the
    // student deleted on the server was handed back by the cache on the
    // very next load — "apagar" looked like it did nothing.
    await salvarConversa(conversa('c-1'));
    await salvarConversa(conversa('c-2'));

    const semRemover = fundirHistorico(
      [await conversaPorIdOffline('u-1', 'c-2') as Conversa],
      await carregarHistoricoOffline('u-1'),
    );
    expect(semRemover.map((c) => c.id).sort()).toEqual(['c-1', 'c-2']);

    await removerConversa('u-1', 'c-1');
    const depois = fundirHistorico(
      [await conversaPorIdOffline('u-1', 'c-2') as Conversa],
      await carregarHistoricoOffline('u-1'),
    );
    expect(depois.map((c) => c.id)).toEqual(['c-2']);
  });
});
