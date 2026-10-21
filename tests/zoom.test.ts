import { escalas, limite, manterFoco, pincar, proximoNivel, topoDaFolha, type Ponto, type Vista } from '../lib/zoom';

const area = { largura: 400, altura: 800 };

test('the sheet never leaves the room: bigger, until its edge meets the room\'s; smaller, anywhere inside', () => {
  const grade = { largura: 360, altura: 1200 };
  // 360 wide in 400: it may slide 20 px each way, never out.
  expect(limite(1, grade, area, 'largura')).toBe(20);
  // 1200 tall in 800: its top may come down to the room's top, its bottom up to the room's bottom.
  expect(limite(1, grade, area, 'altura')).toBe(200);
  expect(limite(2, grade, area, 'largura')).toBe(160);
  // The opening: a tall sheet at its top, a short one centered.
  expect(topoDaFolha(1, grade, area)).toBe(200);
  expect(topoDaFolha(1, { largura: 360, altura: 500 }, area)).toBe(0);
});

test('zooming keeps the point under the fingers (or the tap, or the cursor) in place', () => {
  // A point 100 px right of the center, the sheet at x = 20, the scale doubled.
  const x = manterFoco(100, 20, 2);
  // The sheet point under the focus was (100 - 20) / s0; after, it is at x + 2 * that.
  expect(x + 2 * (100 - 20)).toBe(100);
  expect(manterFoco(0, 0, 3)).toBe(0);
});

test('a pinch keeps the point under the fingers, ignores a finger lifting, and lets go of an edge at once', () => {
  const grade = { largura: 360, altura: 1200 };
  // The events a pinch sends: the total scale, the fingers' center and how many fingers.
  type Evento = { escala: number; centro: Ponto; dedos: number };
  const pinca = (eventos: Evento[], v: Vista) => {
    let anterior = eventos[0];
    for (const e of eventos.slice(1)) {
      if (e.dedos === anterior.dedos) v = pincar(v, e.escala / anterior.escala, anterior.centro, e.centro, 0.6, 4, grade, area);
      anterior = e;
    }
    return v;
  };
  const inicio = { s: 1, x: 0, y: 200 };
  // Spreading the fingers about (100, 50): the sheet point there stays there.
  const abrir = pinca([
    { escala: 1, centro: { x: 100, y: 50 }, dedos: 2 },
    { escala: 1.5, centro: { x: 100, y: 50 }, dedos: 2 },
    { escala: 2, centro: { x: 100, y: 50 }, dedos: 2 },
  ], inicio);
  expect(abrir.s).toBe(2);
  expect(abrir.x + 2 * ((100 - inicio.x) / inicio.s)).toBeCloseTo(100);
  expect(abrir.y + 2 * ((50 - inicio.y) / inicio.s)).toBeCloseTo(50);
  // A finger lifts: the center jumps 150 px to the other one, and the sheet stays where it was.
  const soltar = pinca([
    { escala: 2, centro: { x: 100, y: 50 }, dedos: 2 },
    { escala: 2, centro: { x: 175, y: 200 }, dedos: 1 },
    { escala: 2, centro: { x: 175, y: 200 }, dedos: 1 },
  ], abrir);
  expect(soltar).toEqual(abrir);
  // Pulled down past the top edge, then back up 30 px: the sheet comes up 30 px at once.
  const borda = pinca([
    { escala: 1, centro: { x: 0, y: 0 }, dedos: 2 },
    { escala: 1, centro: { x: 0, y: 900 }, dedos: 2 },
    { escala: 1, centro: { x: 0, y: 870 }, dedos: 2 },
  ], abrir);
  expect(borda.y).toBe(limite(2, grade, area, 'altura') - 30);
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

test('the buttons climb fixed steps and come back down the same ones, to exactly 100%', () => {
  const subir = (s: number) => proximoNivel(s, 1.3, 1.3, 5.2, 1);
  const descer = (s: number) => proximoNivel(s, 1.3, 1.3, 5.2, -1);
  const acima = [subir(1.3)];
  while (acima.length < 6) acima.push(subir(acima[acima.length - 1]));
  expect(acima.map((s) => Math.round((s / 1.3) * 100))).toEqual([125, 150, 200, 300, 400, 400]);
  let s = 5.2;
  const abaixo = [];
  while (s > 1.3) abaixo.push(Math.round(((s = descer(s)) / 1.3) * 100));
  expect(abaixo).toEqual([300, 200, 150, 125, 100]);
  // From a pinch's in-between scale, the next step up or down, never a jump of two.
  expect(subir(1.3 * 1.7)).toBeCloseTo(1.3 * 2);
  expect(descer(1.3 * 1.7)).toBeCloseTo(1.3 * 1.5);
  // A tall sheet on a phone: one step below 100% shows all of it.
  expect(proximoNivel(1, 1, 0.6, 4, -1)).toBe(0.6);
  expect(proximoNivel(0.6, 1, 0.6, 4, 1)).toBe(1);
});
