import { anexarMensagem, rotuloDa } from '../lib/conversations';

const mockChamadas: { tabela: string; op: string; args: unknown[] }[] = [];
let mockRespostas: Record<string, { error: unknown }[]> = {};

jest.mock('../lib/supabase', () => {
  const cadeia = (tabela: string) => {
    const registro = (op: string) => (...args: unknown[]) => {
      mockChamadas.push({ tabela, op, args });
      return proxy;
    };
    const proxy: Record<string, unknown> = {
      then: (ok: (v: unknown) => unknown) => ok((mockRespostas[tabela] ?? []).shift() ?? { error: null }),
    };
    for (const op of ['upsert', 'insert', 'update', 'eq', 'is', 'select']) proxy[op] = registro(op);
    return proxy;
  };
  return { supabase: { from: (t: string) => cadeia(t) } };
});

beforeEach(() => {
  mockChamadas.length = 0;
  mockRespostas = {};
});

test('the history label prefers the full question over a truncated title', () => {
  expect(rotuloDa({ titulo: 'Tô na estação butanta. Como che...', pergunta: 'Tô na estação butanta. Como chego na Poli?' }))
    .toBe('Tô na estação butanta. Como chego na Poli?');
  expect(rotuloDa({ titulo: 'Renomeada', pergunta: 'Outra coisa' })).toBe('Renomeada');
});

test('sending turn 0 creates the conversation idempotently', async () => {
  await anexarMensagem('u', 'c', { ordem: 0, pergunta: 'oi' });
  expect(mockChamadas.filter((c) => c.op === 'upsert').map((c) => c.tabela)).toEqual(['conversas', 'mensagens']);
  expect(mockChamadas.find((c) => c.op === 'upsert')?.args[1]).toEqual({ onConflict: 'id', ignoreDuplicates: true });
});

test('without a unique index the insert is retried plainly and duplicates are ok', async () => {
  mockRespostas = { mensagens: [{ error: { code: '42P10' } }, { error: { code: '23505' } }] };
  await expect(anexarMensagem('u', 'c', { ordem: 1, pergunta: 'oi' })).resolves.toBeUndefined();
  expect(mockChamadas.some((c) => c.tabela === 'mensagens' && c.op === 'insert')).toBe(true);
});

test('completion only touches a still-pending turn', async () => {
  await anexarMensagem('u', 'c', { ordem: 3, pergunta: 'p', resposta: 'r', fontes: [] });
  expect(mockChamadas).toContainEqual({ tabela: 'mensagens', op: 'is', args: ['resposta', null] });
  expect(mockChamadas).toContainEqual({ tabela: 'mensagens', op: 'eq', args: ['ordem', 3] });
});

test('write failures raise', async () => {
  mockRespostas = { mensagens: [{ error: { code: 'XX', message: 'boom' } }] };
  await expect(anexarMensagem('u', 'c', { ordem: 2, pergunta: 'p', resposta: 'r' })).rejects.toThrow('A operação falhou');
});
