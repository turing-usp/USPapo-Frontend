import { elastico, escalaElastica, escalas, limite, manterFoco } from '../lib/zoom';

const area = { largura: 400, altura: 800 };

test('the sheet moves until its edge meets the area, and not at all while it fits', () => {
  const grade = { largura: 360, altura: 1200 };
  expect(limite(1, grade, area, 'largura')).toBe(0);
  expect(limite(1, grade, area, 'altura')).toBe(200);
  expect(limite(2, grade, area, 'largura')).toBe(160);
});

test('past an edge the pull gives less and less, and never jumps', () => {
  expect(elastico(50, 100, 400)).toBe(50);
  expect(elastico(-100, 100, 400)).toBe(-100);
  const passos = [110, 200, 400, 1000, 5000].map((v) => elastico(v, 100, 400));
  passos.reduce((antes, agora) => {
    expect(agora).toBeGreaterThan(antes);
    return agora;
  }, 100);
  // A huge fling past the edge still stays within one area of it.
  expect(elastico(1e6, 100, 400)).toBeLessThan(100 + 400);
  expect(elastico(-1e6, 100, 400)).toBeGreaterThan(-100 - 400);
  // Continuous at the edge.
  expect(elastico(100.001, 100, 400) - 100).toBeLessThan(0.01);
});

test('a pinch past the limits still follows a little, then the limits hold', () => {
  expect(escalaElastica(2, 1, 4)).toBe(2);
  expect(escalaElastica(8, 1, 4)).toBeGreaterThan(4);
  expect(escalaElastica(8, 1, 4)).toBeLessThan(5);
  expect(escalaElastica(0.5, 1, 4)).toBeLessThan(1);
  expect(escalaElastica(0.5, 1, 4)).toBeGreaterThan(0.75);
});

test('zooming keeps the point under the fingers (or the tap, or the cursor) in place', () => {
  // A point 100 px right of the center, the sheet at x = 20, the scale doubled.
  const x = manterFoco(100, 20, 2);
  // The sheet point under the focus was (100 - 20) / s0; after, it is at x + 2 * that.
  expect(x + 2 * (100 - 20)).toBe(100);
  expect(manterFoco(0, 0, 3)).toBe(0);
});

test('100% fits the sheet without shrinking it, and a pinch out shows all of it', () => {
  // A tall timetable on a phone: it keeps its size (pans), and can be zoomed out to fit.
  const fone = escalas({ largura: 360, altura: 1200 }, area, 12, 2.5, 4);
  expect(fone.base).toBe(1);
  expect(fone.minimo).toBeCloseTo((800 - 24) / 1200);
  expect(fone.maximo).toBe(4);
  // A small map on a desktop grows to fit, up to 2.5x.
  const mesa = escalas({ largura: 400, altura: 300 }, { largura: 1900, altura: 900 }, 12, 2.5, 4);
  expect(mesa.base).toBeCloseTo((900 - 24) / 300 > 2.5 ? 2.5 : (900 - 24) / 300);
  expect(mesa.minimo).toBe(mesa.base);
  expect(mesa.maximo).toBeCloseTo(mesa.base * 4);
});
