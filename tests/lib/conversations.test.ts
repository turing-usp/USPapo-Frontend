/**
 * lib/conversations tests, against a fake supabase client (in-memory
 * `conversas` table + the PostgREST chain the store uses:
 * from().select().eq().is().order().limit() / insert / update / delete).
 *
 * The fake simulates the two server-side rules the store relies on:
 * RLS ownership (rows only reachable through the user_id filter the store
 * always applies) and the 5-favorites DB trigger.
 */

/**
 * Scriptable fake of the supabase client. Kept as a hoisted function
 * declaration named `mock*` so the (hoisted) jest.mock factory may call it.
 */
function mockFakeSupabase() {
  type Linha = Record<string, unknown>;
  type FakeError = { message: string; code?: string };
  type Result = { data: Linha[] | null; error: FakeError | null };

  const porUsuario = new Map<string, Map<string, Linha>>();
  const chamadas: Array<Record<string, unknown>> = [];
  const falhas = new Map<string, string>(); // `table:op` -> error message
  const LIMITE_FAVORITAS = 5;

  const linhasDe = (userId: string): Linha[] =>
    [...(porUsuario.get(userId) ?? new Map<string, Linha>()).values()];
  const todas = (): Linha[] => [...porUsuario.values()].flatMap((m) => [...m.values()]);

  const corresponde = (
    linha: Linha,
    filtros: Array<{ col: string; valor: unknown; modo: 'eq' | 'is' }>,
  ): boolean =>
    filtros.every((f) => (f.modo === 'is' ? linha[f.col] == f.valor : linha[f.col] === f.valor));

  class Consulta implements PromiseLike<Result> {
    private filtros: Array<{ col: string; valor: unknown; modo: 'eq' | 'is' }> = [];
    private ordem?: { col: string; ascendente: boolean };
    private limite?: number;

    constructor(
      private tabela: string,
      private op: 'select' | 'insert' | 'update' | 'delete',
      private payload?: Linha,
    ) {}

    eq(col: string, valor: unknown): this {
      this.filtros.push({ col, valor, modo: 'eq' });
      return this;
    }
    is(col: string, valor: unknown): this {
      this.filtros.push({ col, valor, modo: 'is' });
      return this;
    }
    order(col: string, opts?: { ascending?: boolean }): this {
      this.ordem = { col, ascendente: opts?.ascending ?? true };
      return this;
    }
    limit(n: number): this {
      this.limite = n;
      return this;
    }

    async executar(): Promise<Result> {
      const chave = `${this.tabela}:${this.op}`;
      chamadas.push({
        table: this.tabela,
        op: this.op,
        payload: this.payload ? { ...this.payload } : null,
        filtros: this.filtros.map((f) => ({ ...f })),
        ordem: this.ordem,
        limite: this.limite,
      });
      const falha = falhas.get(chave);
      if (falha) return { data: null, error: { message: falha, code: 'fake' } };

      if (this.op === 'select') {
        let dados = todas().filter((l) => corresponde(l, this.filtros));
        if (this.ordem) {
          const { col, ascendente } = this.ordem;
          dados = [...dados].sort((a, b) => {
            const cmp = String(a[col]) < String(b[col]) ? -1 : 1;
            return ascendente ? cmp : -cmp;
          });
        }
        if (this.limite !== undefined) dados = dados.slice(0, this.limite);
        return { data: dados.map((l) => ({ ...l })), error: null };
      }

      if (this.op === 'insert') {
        const linha = this.payload as Linha;
        const userId = String(linha.user_id);
        const tabela = porUsuario.get(userId) ?? new Map<string, Linha>();
        if (tabela.has(String(linha.id))) {
          return {
            data: null,
            error: { message: 'duplicate key value violates unique constraint', code: '23505' },
          };
        }
        tabela.set(String(linha.id), { ...linha });
        porUsuario.set(userId, tabela);
        return { data: [{ ...linha }], error: null };
      }

      if (this.op === 'update') {
        const alvos = todas().filter((l) => corresponde(l, this.filtros));
        if (alvos.length === 0) return { data: [], error: null };
        const payload = this.payload ?? {};
        // The `limitar_favoritas` DB trigger: 5 favorites per user.
        if (payload.favorita === true) {
          const outras = linhasDe(String(alvos[0].user_id)).filter(
            (l) => l.favorita === true && l.id !== alvos[0].id,
          ).length;
          if (outras >= LIMITE_FAVORITAS) {
            return {
              data: null,
              error: { message: 'máximo de 5 conversas favoritas atingido', code: '23514' },
            };
          }
        }
        for (const l of alvos) Object.assign(l, payload);
        return { data: alvos.map((l) => ({ ...l })), error: null };
      }

      // delete
      const alvos = todas().filter((l) => corresponde(l, this.filtros));
      for (const l of alvos) {
        porUsuario.get(String(l.user_id))?.delete(String(l.id));
      }
      return { data: alvos.map((l) => ({ ...l })), error: null };
    }

    then<TResult1 = Result, TResult2 = never>(
      onfulfilled?: ((value: Result) => TResult1 | PromiseLike<TResult1>) | undefined | null,
      onrejected?: ((reason: unknown) => TResult2 | PromiseLike<TResult2>) | undefined | null,
    ): PromiseLike<TResult1 | TResult2> {
      return this.executar().then(
        onfulfilled as (v: unknown) => unknown,
        onrejected as (e: unknown) => unknown,
      ) as unknown as PromiseLike<TResult1 | TResult2>;
    }
  }

  const supabase = {
    from(tabela: string) {
      return {
        select: (_colunas: string) => new Consulta(tabela, 'select'),
        insert: (payload: Linha) => new Consulta(tabela, 'insert', payload),
        update: (payload: Linha) => new Consulta(tabela, 'update', payload),
        delete: () => new Consulta(tabela, 'delete'),
      };
    },
    // Test handles (not part of the real client).
    __uspapo: {
      seed(linhas: Linha[]): void {
        for (const linha of linhas) {
          const userId = String(linha.user_id);
          const mapa = porUsuario.get(userId) ?? new Map<string, Linha>();
          mapa.set(String(linha.id), { ...linha });
          porUsuario.set(userId, mapa);
        }
      },
      rows(): Linha[] {
        return todas().map((l) => ({ ...l }));
      },
      chamadas: chamadas as unknown as Array<Record<string, unknown>>,
      falhar(tabela: string, op: string, mensagem: string): void {
        falhas.set(`${tabela}:${op}`, mensagem);
      },
      limparFalhas(): void {
        falhas.clear();
      },
      reset(): void {
        porUsuario.clear();
        chamadas.length = 0;
        falhas.clear();
      },
    },
  };

  return { supabase };
}

jest.mock('../../lib/supabase', () => mockFakeSupabase());

import { supabase } from '../../lib/supabase';
import { LIMITES } from '../../lib/limits';
import {
  anexarTurno,
  buscar,
  excluir,
  favoritar,
  lerHistorico,
  type Conversa,
} from '../../lib/conversations';

type Handle = {
  seed(linhas: Array<Record<string, unknown>>): void;
  rows(): Array<Record<string, unknown>>;
  chamadas: Array<Record<string, unknown>>;
  falhar(tabela: string, op: string, mensagem: string): void;
  limparFalhas(): void;
  reset(): void;
};

const handle = (supabase as unknown as { __uspapo: Handle }).__uspapo;

const USER = 'u-1';
const OUTRO = 'u-outro';

/** Builds a full conversas row (user_id is the RLS column, not in the type). */
function linha(
  id: string,
  opts: {
    userId?: string;
    pergunta?: string;
    resposta?: string | null;
    favorita?: boolean;
    quando?: string;
  } = {},
): Record<string, unknown> {
  const quando = opts.quando ?? '2026-09-19T12:00:00.000Z';
  return {
    id,
    user_id: opts.userId ?? USER,
    pergunta: opts.pergunta ?? 'pergunta padrão',
    resposta: opts.resposta === undefined ? 'resposta padrão' : opts.resposta,
    favorita: opts.favorita ?? false,
    criada_em: quando,
    atualizada_em: quando,
  };
}

beforeEach(() => {
  handle.reset();
});

// ─────────────────────────────────────────────
// anexarTurno — the P9 pending rule
// ─────────────────────────────────────────────

describe('anexarTurno', () => {
  it('on send: inserts the row with resposta NULL (pending)', async () => {
    await anexarTurno(USER, 'c-1', 'Quanto tempo tem a fila do RUCard?');

    expect(handle.rows()).toHaveLength(1);
    const [row] = handle.rows();
    expect(row.id).toBe('c-1');
    expect(row.user_id).toBe(USER);
    expect(row.pergunta).toBe('Quanto tempo tem a fila do RUCard?');
    expect(row.resposta).toBeNull();
    expect(row.favorita).toBe(false);
    expect(typeof row.criada_em).toBe('string');
    expect(typeof row.atualizada_em).toBe('string');
  });

  it('on completion: updates the pending row with the resposta', async () => {
    await anexarTurno(USER, 'c-1', 'P?');
    await anexarTurno(USER, 'c-1', 'P?', 'R: 10 minutos.');

    expect(handle.rows()).toHaveLength(1);
    expect(handle.rows()[0].resposta).toBe('R: 10 minutos.');
  });

  it('a saved resposta is NEVER overwritten (late/duplicate completion is a no-op)', async () => {
    await anexarTurno(USER, 'c-1', 'P?');
    await anexarTurno(USER, 'c-1', 'P?', 'R original.');
    // A duplicate completion (or a retry answering the same row) arrives later:
    await anexarTurno(USER, 'c-1', 'P?', 'R duplicada.');

    expect(handle.rows()[0].resposta).toBe('R original.');
  });

  it('a mid-stream death leaves the row pending (nothing else is written)', async () => {
    await anexarTurno(USER, 'c-1', 'P?');
    // The stream dies here: the completion call never happens.
    const [row] = handle.rows();
    expect(row.resposta).toBeNull();

    const historico = await lerHistorico(USER);
    expect(historico).toHaveLength(1);
    expect(historico[0].resposta).toBeNull();
  });

  it('surfaces write failures (no silent insert/update)', async () => {
    handle.falhar('conversas', 'insert', 'relation "conversas" does not exist');
    await expect(anexarTurno(USER, 'c-x', 'P?')).rejects.toThrow(/falhou/);
    expect(handle.rows()).toHaveLength(0);
  });
});

// ─────────────────────────────────────────────
// lerHistorico — window + ordering
// ─────────────────────────────────────────────

describe('lerHistorico', () => {
  const ts = (i: number): string => new Date(Date.UTC(2026, 8, 19, 12, 0, i)).toISOString();

  it('returns the last LIMITES.history rows by default, newest first', async () => {
    handle.seed(
      Array.from({ length: 35 }, (_, i) =>
        linha(`c-${i}`, { pergunta: `p${i}`, resposta: `r${i}`, quando: ts(i) }),
      ),
    );

    const historico = await lerHistorico(USER);
    expect(historico).toHaveLength(LIMITES.history); // 30, not 35
    expect(historico[0].id).toBe('c-34'); // newest first
    expect(historico[LIMITES.history - 1].id).toBe('c-5');
    // Oldest rows of the 35 are outside the window.
    const ids = new Set(historico.map((c) => c.id));
    expect(ids.has('c-4')).toBe(false);
  });

  it('sends the right query: user_id filter, atualizada_em desc, limit', async () => {
    handle.seed([linha('c-1', { quando: '2026-09-19T12:00:00.000Z' })]);
    await lerHistorico(USER);

    const chamada = handle.chamadas.at(-1) as Record<string, unknown>;
    expect(chamada.table).toBe('conversas');
    expect(chamada.op).toBe('select');
    expect(chamada.limite).toBe(LIMITES.history);
    expect(chamada.ordem).toEqual({ col: 'atualizada_em', ascendente: false });
    expect(chamada.filtros).toEqual([{ col: 'user_id', valor: USER, modo: 'eq' }]);
  });

  it('honors an explicit limite', async () => {
    handle.seed([
      linha('c-1', { quando: '2026-09-19T12:00:01.000Z' }),
      linha('c-2', { quando: '2026-09-19T12:00:02.000Z' }),
      linha('c-3', { quando: '2026-09-19T12:00:03.000Z' }),
    ]);
    const duas = await lerHistorico(USER, 2);
    expect(duas.map((c) => c.id)).toEqual(['c-3', 'c-2']);
  });

  it('never sees another user\'s rows (RLS ownership via the user_id filter)', async () => {
    handle.seed([
      linha('c-1', { userId: USER, pergunta: 'mine' }),
      linha('c-1', { userId: OUTRO, pergunta: "yours" }),
    ]);
    const historico = await lerHistorico(USER);
    expect(historico).toHaveLength(1);
    expect(historico[0].pergunta).toBe('mine');
  });
});

// ─────────────────────────────────────────────
// favoritar — round-trip + the 5-favorites trigger
// ─────────────────────────────────────────────

describe('favoritar', () => {
  it('round-trips the flag through the store', async () => {
    await anexarTurno(USER, 'c-1', 'P?');

    await favoritar(USER, 'c-1', true);
    expect(handle.rows()[0].favorita).toBe(true);
    const [primeira] = await lerHistorico(USER);
    expect(primeira.favorita).toBe(true);

    await favoritar(USER, 'c-1', false);
    expect((await lerHistorico(USER))[0].favorita).toBe(false);
  });

  it('relays the server rejection when the 5-favorite cap is hit', async () => {
    handle.seed(
      Array.from({ length: 5 }, (_, i) =>
        linha(`c-fav-${i}`, { favorita: true, quando: `2026-09-19T12:00:0${i}.000Z` }),
      ),
    );
    await anexarTurno(USER, 'c-6', 'P?');

    await expect(favoritar(USER, 'c-6', true)).rejects.toThrow(/favorita/i);
    const c6 = handle.rows().find((r) => r.id === 'c-6');
    expect(c6?.favorita).toBeFalsy();

    // Free one slot and the 6th favorite now fits.
    await favoritar(USER, 'c-fav-0', false);
    await favoritar(USER, 'c-6', true);
    expect(handle.rows().find((r) => r.id === 'c-6')?.favorita).toBe(true);
  });
});

// ─────────────────────────────────────────────
// excluir / buscar
// ─────────────────────────────────────────────

describe('excluir', () => {
  it('deletes only the user\'s own row', async () => {
    handle.seed([
      linha('c-1', { userId: USER }),
      linha('c-1', { userId: OUTRO }),
    ]);

    await excluir(USER, 'c-1');
    const restaram = handle.rows();
    expect(restaram).toHaveLength(1);
    expect(restaram[0].user_id).toBe(OUTRO);
  });

  it('surfaces delete failures', async () => {
    handle.seed([linha('c-1')]);
    handle.falhar('conversas', 'delete', 'RLS policy violation');
    await expect(excluir(USER, 'c-1')).rejects.toThrow(/falhou/);
  });
});

describe('buscar', () => {
  const JANELA = (): Record<string, unknown>[] => [
    linha('c-rucard', {
      pergunta: 'Fila do RUCard',
      resposta: 'Cinco minutos por pessoa.',
      quando: '2026-09-19T12:00:01.000Z',
    }),
    linha('c-grade', {
      pergunta: 'Grade de verão',
      resposta: 'Semana A.',
      quando: '2026-09-19T12:00:02.000Z',
    }),
    linha('c-bus', {
      pergunta: 'Bus 3750',
      resposta: 'Aguarde 20 minutos.',
      quando: '2026-09-19T12:00:03.000Z',
    }),
  ];

  it('filters the loaded window locally over pergunta and resposta', async () => {
    handle.seed(JANELA());

    expect((await buscar(USER, 'fila')).map((c) => c.id)).toEqual(['c-rucard']);
    // Case-insensitive.
    expect((await buscar(USER, 'SEMANA A')).map((c) => c.id)).toEqual(['c-grade']);
    // Matches the resposta, not just the pergunta.
    expect((await buscar(USER, 'aguarde')).map((c) => c.id)).toEqual(['c-bus']);
    // No match.
    expect(await buscar(USER, 'bandejão não existe aqui')).toEqual([]);
  });

  it('an empty/blank term returns the whole window', async () => {
    handle.seed(JANELA());
    expect(await buscar(USER, '   ')).toHaveLength(3);
    expect(await buscar(USER, '')).toHaveLength(3);
  });

  it('only sees rows inside the window', async () => {
    const fora = Array.from({ length: 40 }, (_, i) =>
      linha(`c-fora-${i}`, { pergunta: 'fila', quando: `2026-01-${String((i % 28) + 1).padStart(2, '0')}T00:00:00.000Z` }),
    );
    handle.seed([...JANELA(), ...fora]);
    // 43 rows total: the window keeps the 30 newest = the 3 JANELA rows + 27
    // of the 40 c-fora rows; the 13 oldest c-fora rows stay out of scope.
    const achadas = await buscar(USER, 'fila');
    expect(achadas.length).toBeLessThanOrEqual(LIMITES.history);
    expect(achadas.map((c) => c.id)).toContain('c-rucard');
  });

  it('maps rows into the Conversa shape (resposta null stays null)', async () => {
    handle.seed([linha('c-p', { pergunta: 'pendente?', resposta: null })]);
    const [c] = await buscar(USER, 'pendente');
    expect(c).toEqual({
      id: 'c-p',
      pergunta: 'pendente?',
      resposta: null,
      criada_em: '2026-09-19T12:00:00.000Z',
      atualizada_em: '2026-09-19T12:00:00.000Z',
      favorita: false,
    });
    const comoConversa = c as Conversa;
    expect(comoConversa.resposta).toBeNull();
  });
});
