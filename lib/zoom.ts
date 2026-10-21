/**
 * The full-screen viewer's zoom math (components/chat/Visualizador): a drawing centered in an area,
 * scaled about its center and moved by (x, y). Worklets, so the gestures run them on the UI thread
 * every frame; no React Native here, so the tests cover them.
 */

export type Medidas = { largura: number; altura: number };
export type Eixo = keyof Medidas;

/** How much of a pull past an edge (or a zoom limit) still moves the drawing: iOS's own constant. */
const RESISTENCIA = 0.55;

/** How far the drawing may move from the center on an axis at scale `s`: until its edge meets the area's. */
export function limite(s: number, conteudo: Medidas, area: Medidas, eixo: Eixo): number {
  'worklet';
  return Math.max(0, (s * conteudo[eixo] - area[eixo]) / 2);
}

export function preso(v: number, min: number, max: number): number {
  'worklet';
  return Math.min(max, Math.max(min, v));
}

/**
 * A position pulled `v` along an axis that stops at ±`lim`: free inside, and past the edge it gives
 * less and less (a rubber band over `dimensao`, the area's size), never more than `dimensao`.
 */
export function elastico(v: number, lim: number, dimensao: number): number {
  'worklet';
  const puxao = (d: number) => (1 - 1 / ((d * RESISTENCIA) / Math.max(1, dimensao) + 1)) * dimensao;
  if (v > lim) return lim + puxao(v - lim);
  if (v < -lim) return -lim - puxao(-lim - v);
  return v;
}

/** A scale pinched past [min, max]: it still follows the fingers a little, then settles back. */
export function escalaElastica(s: number, min: number, max: number): number {
  'worklet';
  if (s > max) return max * Math.pow(s / max, 0.3);
  if (s < min) return min * Math.pow(s / min, 0.3);
  return s;
}

/**
 * Where the drawing goes when its scale is multiplied by `k` and the point at `foco` (from the
 * area's center) must stay put: what was under the fingers, the double tap or the cursor stays there.
 */
export function manterFoco(foco: number, posicao: number, k: number): number {
  'worklet';
  return foco - k * (foco - posicao);
}

/**
 * The scales of a drawing in an area with a `margem` on each side. `base` is 100% on the zoom bar:
 * the drawing fitted to the area, never below its own size (a tall timetable on a phone pans
 * instead of shrinking) and never more than `encaixeMaximo` (a small drawing on a big screen).
 * `minimo` lets a pinch out show all of it; `maximo` is `zoomMaximo` times the base.
 */
export function escalas(conteudo: Medidas, area: Medidas, margem: number, encaixeMaximo: number, zoomMaximo: number) {
  'worklet';
  const cabe = Math.min((area.largura - 2 * margem) / conteudo.largura, (area.altura - 2 * margem) / conteudo.altura);
  const base = Math.max(1, Math.min(encaixeMaximo, cabe));
  return { base, minimo: Math.min(base, Math.max(0.1, cabe)), maximo: base * zoomMaximo };
}
