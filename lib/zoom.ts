/**
 * The full-screen viewer's zoom math (components/chat/Visualizador): a sheet centered in a room,
 * scaled about its center and moved by (x, y). One rule keeps it in place, applied on every move
 * and never corrected afterwards: the sheet never leaves the room. Worklets, so the gestures run
 * them on the UI thread every frame; no React Native here, so the tests cover them.
 */

export type Medidas = { largura: number; altura: number };
export type Eixo = keyof Medidas;

/**
 * How far the sheet may move from the center on an axis at scale `s`. Bigger than the room, until
 * its edge meets the room's; smaller, anywhere inside it (a short sheet zoomed in stays where it
 * was zoomed, instead of being pulled back to the middle).
 */
export function limite(s: number, conteudo: Medidas, area: Medidas, eixo: Eixo): number {
  'worklet';
  return Math.abs(s * conteudo[eixo] - area[eixo]) / 2;
}

export function preso(v: number, min: number, max: number): number {
  'worklet';
  return Math.min(max, Math.max(min, v));
}

/**
 * Where the sheet goes when its scale is multiplied by `k` and the point at `foco` (from the room's
 * center) must stay put: what was under the fingers, the double tap or the cursor stays there.
 */
export function manterFoco(foco: number, posicao: number, k: number): number {
  'worklet';
  return foco - k * (foco - posicao);
}

export type Ponto = { x: number; y: number };
export type Vista = { s: number; x: number; y: number };

/**
 * One pinch event, from where the sheet is: the scale times `fator` (within `minimo`..`maximo`), the
 * point that was under the fingers' center (`antes`) under it again where it is now (`agora`), and the
 * sheet kept in the room. From where the sheet is, never from where the pinch began: held at an edge,
 * it answers as soon as the fingers turn back.
 */
export function pincar(v: Vista, fator: number, antes: Ponto, agora: Ponto, minimo: number, maximo: number,
  conteudo: Medidas, area: Medidas): Vista {
  'worklet';
  const s = preso(v.s * fator, minimo, maximo);
  const k = s / v.s;
  const mx = limite(s, conteudo, area, 'largura');
  const my = limite(s, conteudo, area, 'altura');
  return {
    s,
    x: preso(manterFoco(antes.x, v.x, k) + agora.x - antes.x, -mx, mx),
    y: preso(manterFoco(antes.y, v.y, k) + agora.y - antes.y, -my, my),
  };
}

/**
 * The scales of a sheet in a room with a `margem` on each side. `base` is 100% on the zoom bar:
 * the sheet fitted to the room, never below its own size (a tall timetable on a phone pans
 * instead of shrinking) and never more than `encaixeMaximo` (a small drawing on a big screen).
 * `minimo` lets a pinch out show all of it; `maximo` is `zoomMaximo` times the base.
 */
export function escalas(conteudo: Medidas, area: Medidas, margem: number, encaixeMaximo: number, zoomMaximo: number) {
  'worklet';
  const cabe = Math.min((area.largura - 2 * margem) / conteudo.largura, (area.altura - 2 * margem) / conteudo.altura);
  const base = Math.max(1, Math.min(encaixeMaximo, cabe));
  return { base, minimo: Math.min(base, Math.max(0.1, cabe)), maximo: base * zoomMaximo };
}

/** The opening's height position at scale `s`: a sheet taller than the room at its top, else centered. */
export function topoDaFolha(s: number, conteudo: Medidas, area: Medidas): number {
  'worklet';
  return s * conteudo.altura > area.altura ? limite(s, conteudo, area, 'altura') : 0;
}

/** The zoom bar's steps, as multiples of 100% (the fitted sheet): the same way up and down. */
export const NIVEIS = [1, 1.25, 1.5, 2, 3, 4] as const;

/**
 * The scale a zoom button (or key) goes to from `atual`: the next step of `NIVEIS` up or down,
 * from wherever a pinch left it. Below 100% there is one more step when the sheet is taller than
 * the room, `minimo` (all of it on screen); past the ends it stays put.
 */
export function proximoNivel(atual: number, base: number, minimo: number, maximo: number, direcao: 1 | -1): number {
  'worklet';
  const niveis: number[] = [];
  if (minimo < base * 0.99) niveis.push(minimo);
  for (const n of NIVEIS) {
    if (base * n <= maximo * 1.001) niveis.push(base * n);
  }
  const folga = base * 0.01;
  if (direcao > 0) {
    for (const n of niveis) if (n > atual + folga) return n;
    return niveis[niveis.length - 1];
  }
  for (let i = niveis.length - 1; i >= 0; i--) if (niveis[i] < atual - folga) return niveis[i];
  return niveis[0];
}
