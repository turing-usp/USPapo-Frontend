/**
 * The animated USPapo mark (components/chat/Andamento.tsx), in the units of LogoUSPapo's viewBox.
 *
 * The logo's two pages are parallelograms: the back one (upper left, with three text lines) and the
 * front one (lower right), which always hides the part of the back page that lies under it. While
 * loading, the pages go around one square counterclockwise from opposite corners, a step at a time,
 * starting from the logo itself (each page sits halfway along a side of the square). From any point
 * of that loop the mark can settle back into the logo (`repouso`) or collapse into the answer's
 * cursor (`colapso`): both blend away from the loop as it keeps moving, so nothing stops short.
 * The back page's text lines belong to the still logo: they slide under the front page as the loop
 * leaves it and come back out when the mark settles.
 *
 * The pose functions are worklets: Reanimated runs them on the UI thread every frame.
 */

export type Vetor = [number, number];
/** A parallelogram: its top-left corner, its top edge and its left edge. */
export type Pagina = { o: Vetor; u: Vetor; v: Vetor };

export const VERSO: Pagina = { o: [143.79671, 46.152882], u: [141.78215, 81.85796], v: [0, 328.716238] };
export const FRENTE: Pagina = { o: [228.13173, 55.371627], u: [140.57466, 81.914983], v: [0.02495, 315.267903] };
/** Stroke width of both pages. */
export const TRACO = 25;
/** Half the side of the square: how far each page moves up or down from its place in the logo. */
const MEIO_LADO = 42;
/** Fraction of each step a page rests on its corner before moving on. */
const PAUSA = 0.18;
/** Every pose fits in this box, strokes and miter tips included. */
export const CAIXA = { x: 131.3, y: -17.6, largura: 251.3, altura: 538.2 };

/** A logo point in the back page's own coordinates (fractions of its edges). */
function local(p: Pagina, [x, y]: Vetor): Vetor {
  const s = (x - p.o[0]) / p.u[0];
  return [s, (y - p.o[1] - s * p.u[1]) / p.v[1]];
}

/** The back page's text lines, which run on under the front page's left edge. */
const LINHAS: [Vetor, Vetor][] = [150.72653, 228.6491, 306.48441].map((y) => [local(VERSO, [189.00964, y]), local(VERSO, [228.1516, y])]);

/** Corners of the square for a page's top-left corner, counterclockwise: top left, bottom left, bottom right, top right. */
const CANTOS: Vetor[] = [
  [VERSO.o[0], VERSO.o[1] - MEIO_LADO],
  [VERSO.o[0], VERSO.o[1] + MEIO_LADO],
  [FRENTE.o[0], FRENTE.o[1] + MEIO_LADO],
  [FRENTE.o[0], FRENTE.o[1] - MEIO_LADO],
];
/** The corner each page reaches first: the back page goes down, the front page goes up. */
const PRIMEIRO_VERSO = 1;
const PRIMEIRO_FRENTE = 3;

/** The answer's cursor as a page: a bar whose stroke fills it, `escala` px per unit. */
export function paginaDoCursor(escala: number, cursor: { x: number; y: number; largura: number; altura: number }): Pagina {
  return {
    o: [CAIXA.x + cursor.x / escala + TRACO / 2, CAIXA.y + cursor.y / escala + TRACO / 2],
    u: [Math.max(1, cursor.largura / escala - TRACO), 0],
    v: [0, Math.max(1, cursor.altura / escala - TRACO)],
  };
}

function misturar(a: Vetor, b: Vetor, t: number): Vetor {
  'worklet';
  return [a[0] + (b[0] - a[0]) * t, a[1] + (b[1] - a[1]) * t];
}

function suave(t: number): number {
  'worklet';
  return t < 0.5 ? 4 * t * t * t : 1 - Math.pow(-2 * t + 2, 3) / 2;
}

/**
 * Where a page's top-left corner is at `fase` (in steps). Over the first half step the page leaves
 * its place in the logo (the middle of a side) for its first corner; then it moves corner to corner.
 */
function canto(fase: number, primeiro: number): Vetor {
  'worklet';
  if (fase < 0.5) {
    const antes = CANTOS[(primeiro + 3) % 4];
    const depois = CANTOS[primeiro];
    return misturar(misturar(antes, depois, 0.5), depois, suave(Math.max(0, fase) / 0.5));
  }
  const passo = Math.floor(fase - 0.5);
  const f = Math.min(1, Math.max(0, (fase - 0.5 - passo - PAUSA) / (1 - PAUSA)));
  return misturar(CANTOS[(primeiro + passo) % 4], CANTOS[(primeiro + passo + 1) % 4], suave(f));
}

function pagina(base: Pagina, primeiro: number, fase: number, repouso: number, colapso: number, cursor: Pagina): Pagina {
  'worklet';
  const o = misturar(canto(fase, primeiro), base.o, repouso);
  return { o: misturar(o, cursor.o, colapso), u: misturar(base.u, cursor.u, colapso), v: misturar(base.v, cursor.v, colapso) };
}

function ponto(p: Pagina, s: number, t: number): Vetor {
  'worklet';
  return [p.o[0] + s * p.u[0] + t * p.v[0], p.o[1] + s * p.u[1] + t * p.v[1]];
}

function vertices(p: Pagina): Vetor[] {
  'worklet';
  return [ponto(p, 0, 0), ponto(p, 1, 0), ponto(p, 1, 1), ponto(p, 0, 1)];
}

/** The stretch [entra, sai] of segment a-b inside the convex page `p` (Cyrus-Beck), or null. */
function dentro(a: Vetor, b: Vetor, p: Vetor[]): Vetor | null {
  'worklet';
  let entra = 0;
  let sai = 1;
  const d: Vetor = [b[0] - a[0], b[1] - a[1]];
  for (let i = 0; i < 4; i++) {
    const q = p[i];
    const r = p[(i + 1) % 4];
    // Corners run clockwise on screen (y down), so (-dy, dx) of each edge points inward.
    const n: Vetor = [q[1] - r[1], r[0] - q[0]];
    const num = n[0] * (q[0] - a[0]) + n[1] * (q[1] - a[1]);
    const den = n[0] * d[0] + n[1] * d[1];
    if (Math.abs(den) < 1e-9) {
      if (num > 0) return null;
    } else if (den > 0) entra = Math.max(entra, num / den);
    else sai = Math.min(sai, num / den);
    if (entra >= sai) return null;
  }
  return [entra, sai];
}

/** The parts of segment a-b outside `frente`, as [from, to] fractions. */
function fora(a: Vetor, b: Vetor, frente: Vetor[]): Vetor[] {
  'worklet';
  const coberto = dentro(a, b, frente);
  if (!coberto) return [[0, 1]];
  const partes: Vetor[] = [];
  if (coberto[0] > 1e-6) partes.push([0, coberto[0]]);
  if (coberto[1] < 1 - 1e-6) partes.push([coberto[1], 1]);
  return partes;
}

const n1 = (x: number) => {
  'worklet';
  return Math.round(x * 10) / 10;
};

/**
 * The SVG paths of one frame: the front page, and what shows of the back page (its outline and
 * lines minus the front page). Contiguous visible stretches of the outline stay one subpath, so
 * their corners keep the logo's mitered joins.
 */
export function tracados(fase: number, repouso: number, colapso: number, cursor: Pagina): { verso: string; frente: string } {
  'worklet';
  const verso = pagina(VERSO, PRIMEIRO_VERSO, fase, repouso, colapso, cursor);
  const frente = vertices(pagina(FRENTE, PRIMEIRO_FRENTE, fase, repouso, colapso, cursor));
  const contorno = vertices(verso);

  // Visible stretches of the back outline in drawing order: [edge, from, to].
  const trechos: number[][] = [];
  for (let i = 0; i < 4; i++) {
    for (const [de, ate] of fora(contorno[i], contorno[(i + 1) % 4], frente)) trechos.push([i, de, ate]);
  }
  const emenda = (a: number[], b: number[]) => a[2] > 1 - 1e-6 && b[1] < 1e-6 && (a[0] + 1) % 4 === b[0];
  let d = '';
  if (trechos.length === 4 && trechos.every((t) => t[1] < 1e-6 && t[2] > 1 - 1e-6)) {
    d = `M${n1(contorno[0][0])} ${n1(contorno[0][1])}L${n1(contorno[1][0])} ${n1(contorno[1][1])}L${n1(contorno[2][0])} ${n1(contorno[2][1])}L${n1(contorno[3][0])} ${n1(contorno[3][1])}Z`;
  } else if (trechos.length) {
    // Start right after a break, so no stretch is split at the first corner.
    let inicio = 0;
    for (let i = 0; i < trechos.length; i++) {
      if (!emenda(trechos[(i + trechos.length - 1) % trechos.length], trechos[i])) {
        inicio = i;
        break;
      }
    }
    for (let k = 0; k < trechos.length; k++) {
      const atual = trechos[(inicio + k) % trechos.length];
      const a = contorno[atual[0]];
      const b = contorno[(atual[0] + 1) % 4];
      const de = misturar(a, b, atual[1]);
      const ate = misturar(a, b, atual[2]);
      const continua = k > 0 && emenda(trechos[(inicio + k - 1) % trechos.length], atual);
      d += `${continua ? '' : `M${n1(de[0])} ${n1(de[1])}`}L${n1(ate[0])} ${n1(ate[1])}`;
    }
  }
  // How much of the text lines shows: all of it in the logo, none once the loop is under way.
  const linhas = Math.max(repouso, 1 - suave(Math.min(1, Math.max(0, fase) / 0.5)));
  for (const [s, t] of linhas > 1e-3 ? LINHAS : []) {
    const a = ponto(verso, t[0] + (s[0] - t[0]) * linhas, t[1] + (s[1] - t[1]) * linhas);
    const b = ponto(verso, t[0], t[1]);
    for (const [de, ate] of fora(a, b, frente)) {
      const p = misturar(a, b, de);
      const q = misturar(a, b, ate);
      d += `M${n1(p[0])} ${n1(p[1])}L${n1(q[0])} ${n1(q[1])}`;
    }
  }
  const f = frente.map((p) => `${n1(p[0])} ${n1(p[1])}`);
  return { verso: d || 'M0 0', frente: `M${f[0]}L${f[1]}L${f[2]}L${f[3]}Z` };
}
