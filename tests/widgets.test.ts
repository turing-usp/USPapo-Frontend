import { BASE, buscarMapa, decodificar, enquadrar, projetar } from '../lib/mapa';
import { lerWidget, semWidgets, separarWidgets } from '../lib/widgets';

jest.mock('../lib/supabase', () => ({ supabase: {} }));
jest.mock('../lib/auth', () => ({ sessaoAtual: async () => ({ userId: 'u', token: 't' }) }));

const RESPOSTA = 'Pegue o **8084-10**.\n\n```uspapo-mapa\nlinha=8084-10 de=120010354 ate=1211429 origem=p1\n```';

test('a widget fence is read; any other fence is code', () => {
  expect(lerWidget('uspapo-mapa', 'linha=8084-10 de=120010354 ate=1211429 origem=p1\n')).toEqual({
    tipo: 'mapa', campos: { linha: '8084-10', de: '120010354', ate: '1211429', origem: 'p1' },
  });
  expect(lerWidget('python', 'x = 1')).toBeNull();
  expect(lerWidget('', 'texto')).toBeNull();
});

test('copying, sharing and KaTeX get the prose without the widget', () => {
  expect(semWidgets(RESPOSTA)).toBe('Pegue o **8084-10**.');
  expect(separarWidgets(RESPOSTA)[1]).toBe('```uspapo-mapa\nlinha=8084-10 de=120010354 ate=1211429 origem=p1\n```');
  expect(semWidgets('```python\nx = 1\n```')).toBe('```python\nx = 1\n```');
});

test("Google's polyline example decodes", () => {
  expect(decodificar('_p~iF~ps|U_ulLnnqC_mqNvxq`@')).toEqual([[38.5, -120.2], [40.7, -120.95], [43.252, -126.453]]);
});

test('the frame keeps every point, the box aspect and a minimum width', () => {
  const pontos = [projetar([-23.5718, -46.7082]), projetar([-23.5694, -46.7414])];
  const [x, y, largura, altura] = enquadrar(pontos, 1.5);
  expect(largura / altura).toBeCloseTo(1.5);
  for (const [px, py] of pontos) {
    expect(px).toBeGreaterThan(x);
    expect(px).toBeLessThan(x + largura);
    expect(py).toBeGreaterThan(y);
    expect(py).toBeLessThan(y + altura);
  }
  expect(enquadrar([[0, 0], [10, 10]], 1.5)[2]).toBe(600);
  // The base layer's origin projects to (0, 0).
  expect(projetar(BASE.origem as [number, number])).toEqual([0, 0]);
});

test('the map asks the backend once per reference and forgets failures', async () => {
  const respostas = [new Response('x', { status: 500 }), Response.json({ rota: '??', embarque: [0, 0], desembarque: [0, 0], origem: null, destino: null })];
  const fetch = jest.spyOn(globalThis, 'fetch').mockImplementation(async () => respostas.shift()!);
  const campos = { linha: '8084-10', de: '1', ate: '2', origem: 'p1' };
  await expect(buscarMapa(campos)).rejects.toThrow('mapa 500');
  await expect(buscarMapa(campos)).resolves.toMatchObject({ rota: '??' });
  await buscarMapa(campos);
  expect(fetch).toHaveBeenCalledTimes(2);
  expect(String(fetch.mock.calls[0][0])).toMatch(/\/api\/mapa\?linha=8084-10&de=1&ate=2&origem=p1$/);
  expect(fetch.mock.calls[0][1]).toEqual({ headers: { Authorization: 'Bearer t' } });
  fetch.mockRestore();
});
