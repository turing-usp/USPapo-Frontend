import { CAIXA, FRENTE, TRACO, VERSO, paginaDoCursor, tracados } from '../lib/logo';

const ESCALA = 28 / CAIXA.altura;
const CURSOR = paginaDoCursor(ESCALA, { x: 0, y: 4, largura: 2, altura: 18 });
const numeros = (d: string) => (d.match(/-?\d+(\.\d+)?/g) ?? []).map(Number);

test('at rest the mark is the logo: the back page cut where the front page covers it', () => {
  const { verso, frente } = tracados(0, 0, 0, CURSOR);
  expect(numeros(frente).slice(0, 2)).toEqual([228.1, 55.4]);
  // LogoUSPapo's back page (the same polyline, drawn the other way round) and its three lines.
  expect(verso).toBe('M285.6 404.1L285.6 456.7L143.8 374.9L143.8 46.2L228.1 94.8'
    + 'M189 150.7L228.1 150.7M189 228.6L228.1 228.6M189 306.5L228.2 306.5');
});

test('the text lines slide under the front page as the loop starts and come back when it settles', () => {
  const tracos = (d: string) => (d.match(/M/g) ?? []).length;
  expect(tracos(tracados(0, 0, 0, CURSOR).verso)).toBe(4);
  expect(tracos(tracados(0.5, 0, 0, CURSOR).verso)).toBe(1);
  expect(tracos(tracados(2.2, 0, 0, CURSOR).verso)).toBeLessThanOrEqual(2);
  expect(tracados(2.2, 1, 0, CURSOR).verso).toBe(tracados(0, 0, 0, CURSOR).verso);
});

test('the pages swap corners counterclockwise and the loop is periodic', () => {
  const canto = (fase: number) => numeros(tracados(fase, 0, 0, CURSOR).frente).slice(0, 2);
  // The front page first goes up (top right), then left (top left), down, right.
  expect(canto(0.5)).toEqual([228.1, 13.4]);
  expect(canto(1.5)).toEqual([143.8, 4.2]);
  expect(canto(2.5)).toEqual([143.8, 88.2]);
  expect(canto(4.5)).toEqual(canto(0.5));
  expect(tracados(7.3, 0, 0, CURSOR)).toEqual(tracados(3.3, 0, 0, CURSOR));
});

test('collapsing from any phase ends on the cursor, and settling ends on the logo', () => {
  for (const fase of [0.2, 1.7, 2.95, 3.4]) {
    const fim = tracados(fase, 0, 1, CURSOR);
    const [x, y] = numeros(fim.frente);
    expect(x).toBeCloseTo(CAIXA.x + TRACO / 2, 0);
    expect(y).toBeCloseTo(CAIXA.y + 4 / ESCALA + TRACO / 2, 0);
    expect(tracados(fase, 1, 0, CURSOR)).toEqual(tracados(0, 0, 0, CURSOR));
  }
});

test('every pose stays inside the box and moves smoothly', () => {
  let antes = numeros(tracados(0, 0, 0, CURSOR).frente);
  for (let fase = 0.01; fase < 4.5; fase += 0.01) {
    const agora = numeros(tracados(fase, 0, 0, CURSOR).frente);
    agora.forEach((v, i) => expect(Math.abs(v - antes[i])).toBeLessThan(4));
    for (let i = 0; i < agora.length; i += 2) {
      expect(agora[i]).toBeGreaterThanOrEqual(CAIXA.x + TRACO / 2);
      expect(agora[i]).toBeLessThanOrEqual(CAIXA.x + CAIXA.largura - TRACO / 2);
    }
    antes = agora;
  }
  expect(VERSO.o[1]).toBeLessThan(FRENTE.o[1]);
});
