import { ApiError } from '../lib/api';
import { iniciar, linhasSalvas, reduzir, traduzirFalha, type EstadoChat } from '../lib/chat';
import type { ChatEvent } from '../lib/api';

jest.mock('../lib/supabase', () => ({ supabase: {} }));

const aplicar = (estado: EstadoChat, eventos: ChatEvent[]) => eventos.reduce(reduzir, estado);

test('a full successful turn', () => {
  const fim = aplicar(iniciar('Cardápio?', 2, []), [
    { type: 'provedor', name: 'groq', index: 0 },
    { type: 'pensando' },
    { type: 'tool', state: 'start', index: 0, name: 'consultar_bandejao' },
    { type: 'tool', state: 'end', index: 0, name: 'consultar_bandejao', results: 1 },
    { type: 'text', delta: 'Arroz ' },
    { type: 'text', delta: 'e feijão' },
    { type: 'sources', urls: ['https://usp.br/a'] },
    { type: 'end' },
  ]);
  expect(fim.status).toBe('idle');
  expect(fim.linhas.map((l) => l.autor)).toEqual(['user', 'ferramenta', 'assistant']);
  expect(fim.linhas[1]).toMatchObject({ pronta: true, resultados: 1 });
  expect(fim.linhas[2]).toMatchObject({ texto: 'Arroz e feijão', fontes: ['https://usp.br/a'], completo: true, ordem: 2 });
});

test('pensando only marks "not writing" and carries no text', () => {
  const escrevendo = aplicar(iniciar('oi', 0, []), [{ type: 'text', delta: 'a' }]);
  expect(escrevendo.escrevendo).toBe(true);
  expect(reduzir(escrevendo, { type: 'pensando' }).escrevendo).toBe(false);
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
