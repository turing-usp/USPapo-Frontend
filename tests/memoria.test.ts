import { itensDaMemoria, lerMemoria, paraMemoria, semFato, tabelaAusente } from '../lib/memoria';

let mockResposta: unknown = { data: null, error: null, status: 200 };
jest.mock('../lib/supabase', () => {
  const cadeia = { select: () => cadeia, eq: () => cadeia, maybeSingle: async () => mockResposta };
  return { supabase: { from: () => cadeia } };
});

test('a missing row is on and empty; a malformed fatos is empty', () => {
  expect(paraMemoria(null)).toEqual({ ativa: true, fatos: {} });
  expect(paraMemoria({ ativa: false, fatos: ['x'] })).toEqual({ ativa: false, fatos: {} });
  expect(paraMemoria({ ativa: true, fatos: { curso: 'BCC' } })).toEqual({ ativa: true, fatos: { curso: 'BCC' } });
});

test('facts are listed in label order, notes last with their index, blanks skipped', () => {
  const itens = itensDaMemoria({
    observacoes: ['Faz estágio', '', 'Mora em Pinheiros'], vinculo: 'graduação', curso: ' Engenharia Elétrica ',
    unidade: '', ingresso: 2026, extra: 'ignorado',
  });
  expect(itens).toEqual([
    { chave: 'curso', rotulo: 'Curso', valor: 'Engenharia Elétrica' },
    { chave: 'ingresso', rotulo: 'Ingresso', valor: '2026' },
    { chave: 'vinculo', rotulo: 'Vínculo', valor: 'graduação' },
    { chave: 'observacoes', rotulo: 'Observações', valor: 'Faz estágio', indice: 0 },
    { chave: 'observacoes', rotulo: 'Observações', valor: 'Mora em Pinheiros', indice: 2 },
  ]);
  expect(itensDaMemoria({})).toEqual([]);
  expect(itensDaMemoria({ observacoes: 'não é lista', campus: { x: 1 } })).toEqual([]);
});

test('removing a fact keeps the rest (unknown keys too) and does not mutate', () => {
  const fatos = { curso: 'BCC', unidade: 'IME', futuro: 1, observacoes: ['a', 'b'] };
  expect(semFato(fatos, { chave: 'curso' })).toEqual({ unidade: 'IME', futuro: 1, observacoes: ['a', 'b'] });
  expect(semFato(fatos, { chave: 'observacoes', indice: 0 })).toEqual({ curso: 'BCC', unidade: 'IME', futuro: 1, observacoes: ['b'] });
  expect(semFato({ observacoes: ['a'] }, { chave: 'observacoes', indice: 0 })).toEqual({});
  expect(semFato(fatos, { chave: 'observacoes' })).toEqual({ curso: 'BCC', unidade: 'IME', futuro: 1 });
  expect(fatos).toEqual({ curso: 'BCC', unidade: 'IME', futuro: 1, observacoes: ['a', 'b'] });
});

test('a table that does not exist yet reads as unavailable', async () => {
  expect(tabelaAusente({ code: 'PGRST205' })).toBe(true);
  expect(tabelaAusente({ code: '42P01' })).toBe(true);
  expect(tabelaAusente({ code: '' }, 404)).toBe(true);
  expect(tabelaAusente({ code: '42501' }, 403)).toBe(false);
  expect(tabelaAusente(null, 404)).toBe(false);

  mockResposta = { data: null, error: { code: 'PGRST205', message: 'missing' }, status: 404 };
  await expect(lerMemoria('u')).resolves.toBeNull();
  mockResposta = { data: null, error: null, status: 200 };
  await expect(lerMemoria('u')).resolves.toEqual({ ativa: true, fatos: {} });
});
