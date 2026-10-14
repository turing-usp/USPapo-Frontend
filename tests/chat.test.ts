import { ApiError } from '../lib/api';
import { iniciar, linhasSalvas, reduzir, traduzirFalha, type EstadoChat } from '../lib/chat';
import type { ChatEvent } from '../lib/api';

jest.mock('../lib/supabase', () => ({ supabase: {} }));

const aplicar = (estado: EstadoChat, eventos: ChatEvent[]) => eventos.reduce(reduzir, estado);

test('a full successful turn', () => {
  const fim = aplicar(iniciar('Cardápio?', 2, []), [
    { type: 'status', text: 'Consultando cardápio' },
    { type: 'text', delta: 'Arroz ' },
    { type: 'text', delta: 'e feijão' },
    { type: 'sources', urls: ['https://usp.br/a'] },
    { type: 'end' },
  ]);
  expect(fim.status).toBe('idle');
  expect(fim.etapa).toBe('Consultando cardápio');
  expect(fim.linhas.map((l) => l.autor)).toEqual(['user', 'assistant']);
  expect(fim.linhas[1]).toMatchObject({ texto: 'Arroz e feijão', fontes: ['https://usp.br/a'], completo: true, ordem: 2 });
});

test('the status keeps the last tool used, and text around tools stays one answer', () => {
  const fim = aplicar(iniciar('oi', 0, []), [
    { type: 'status', text: 'Pesquisando a web' },
    { type: 'text', delta: 'Vou ver. ' },
    { type: 'status', text: 'Avaliando professores' },
    { type: 'text', delta: 'Pronto.' },
    { type: 'status', text: '   ' },
  ]);
  expect(fim.etapa).toBe('Avaliando professores');
  expect(fim.linhas.filter((l) => l.autor === 'assistant')).toEqual([expect.objectContaining({ texto: 'Vou ver. Pronto.' })]);
  expect(iniciar('de novo', 0, fim.linhas).etapa).toBeNull();
});

test('an error is terminal: later events do not touch the state', () => {
  const erro = aplicar(iniciar('oi', 0, []), [{ type: 'error', message: 'Ops' }, { type: 'text', delta: 'tarde' }, { type: 'end' }]);
  expect(erro.status).toBe('errou');
  expect(erro.linhas.map((l) => l.autor)).toEqual(['user', 'erro']);
});

test('a follow-up never grows the previous answer', () => {
  const anteriores = linhasSalvas([{ ordem: 0, pergunta: 'a', resposta: 'b', fontes: [] }]);
  const fim = aplicar(iniciar('c', 1, anteriores), [{ type: 'text', delta: 'd' }, { type: 'end' }]);
  expect(fim.linhas.filter((l) => l.autor === 'assistant').map((l) => (l as { texto: string }).texto)).toEqual(['b', 'd']);
});

test('saved pending turns are left out (they are re-sent)', () => {
  expect(linhasSalvas([{ ordem: 0, pergunta: 'a', resposta: null, fontes: [] }])).toEqual([]);
});

test('failures become typed pt-BR errors', () => {
  expect(traduzirFalha(new ApiError('x', 401, null)).tipo).toBe('sessao');
  expect(traduzirFalha(new ApiError('Calma', 429, 10))).toEqual({ mensagem: 'Calma', tipo: 'limite' });
  expect(traduzirFalha(new TypeError('Network request failed')).tipo).toBe('rede');
});
