// Builds the inline map's base layer (assets/mapa/campus.json) from OpenStreetMap: the campus outline,
// its buildings and inner streets, the avenues around it, water and the railway. Bundled with the app,
// so a map draws with no tile server; the backend sends only the ride (lib/widgets.ts).
// Run again when the campus changes: `node scripts/mapa-campus.mjs [overpass.json]` (a saved Overpass
// answer is reused instead of downloading). Data © OpenStreetMap contributors, ODbL.
import { mkdirSync, readFileSync, writeFileSync } from 'node:fs';

const CAMPUS = 20199272; // relation "Universidade de São Paulo - Cidade Universitária Armando de Salles Oliveira"
const CAIXA = [-23.58, -46.756, -23.542, -46.7]; // south, west, north, east: the trips the transport tool plans
const ORIGEM = [-23.56, -46.725]; // the projection's (0, 0), near the middle of the campus
const VIAS = '^(motorway|trunk|primary|secondary|tertiary)(_link)?$';
const VIAS_INTERNAS = '^(residential|unclassified|service|living_street|pedestrian|road)$';

const consulta = `[out:json][timeout:150];
(
  way["highway"~"${VIAS}"](${CAIXA});
  way["highway"~"${VIAS_INTERNAS}"](${CAIXA});
  way["railway"="rail"](${CAIXA});
  way["natural"="water"](${CAIXA});
  relation["natural"="water"](${CAIXA});
  way["building"](${CAIXA});
  relation(${CAMPUS});
);
out geom;`;

async function baixar() {
  for (let tentativa = 1; tentativa <= 4; tentativa++) {
    const res = await fetch('https://overpass-api.de/api/interpreter', {
      method: 'POST',
      headers: { 'User-Agent': 'USPapo-basemap/1.0', 'Content-Type': 'application/x-www-form-urlencoded' },
      body: new URLSearchParams({ data: consulta }),
    });
    if (res.ok) return res.json();
    console.warn(`Overpass ${res.status}, tentativa ${tentativa}`);
    await new Promise((r) => setTimeout(r, 30_000));
  }
  throw new Error('Overpass indisponível');
}

const dados = process.argv[2] ? JSON.parse(readFileSync(process.argv[2], 'utf8')) : await baixar();

// Local meters: x east, y south (SVG's y grows downwards).
const KX = 111_320 * Math.cos((ORIGEM[0] * Math.PI) / 180);
const KY = 110_574;
const projetar = ({ lat, lon }) => [(lon - ORIGEM[1]) * KX, (ORIGEM[0] - lat) * KY];

function simplificar(pontos, tolerancia) {
  if (pontos.length < 3) return pontos;
  const manter = new Uint8Array(pontos.length);
  manter[0] = manter[pontos.length - 1] = 1;
  const pilha = [[0, pontos.length - 1]];
  while (pilha.length) {
    const [a, b] = pilha.pop();
    const [ax, ay] = pontos[a];
    const [vx, vy] = [pontos[b][0] - ax, pontos[b][1] - ay];
    const norma = Math.hypot(vx, vy);
    let pior = 0;
    let indice = -1;
    for (let i = a + 1; i < b; i++) {
      const [px, py] = [pontos[i][0] - ax, pontos[i][1] - ay];
      const d = norma ? Math.abs(px * vy - py * vx) / norma : Math.hypot(px, py);
      if (d > pior) [pior, indice] = [d, i];
    }
    if (indice >= 0 && pior > tolerancia) {
      manter[indice] = 1;
      pilha.push([a, indice], [indice, b]);
    }
  }
  return pontos.filter((_, i) => manter[i]);
}

/** SVG path data in whole meters, relative moves (the shortest text). */
function caminho(linhas, fechar, tolerancia) {
  let saida = '';
  for (const linha of linhas) {
    const pontos = simplificar(linha.map(projetar), tolerancia).map(([x, y]) => [Math.round(x), Math.round(y)]);
    if (pontos.length < 2) continue;
    const [x0, y0] = pontos[0];
    let [px, py] = [x0, y0];
    const passos = [];
    for (const [x, y] of pontos.slice(1)) {
      if (x === px && y === py) continue;
      passos.push(`${x - px} ${y - py}`);
      [px, py] = [x, y];
    }
    // A shape that rounds to a point (or a sliver, for an area) draws nothing: an empty `l` is invalid.
    if (passos.length < (fechar ? 2 : 1)) continue;
    saida += `M${x0} ${y0}l` + passos.join(' ').replace(/ -/g, '-') + (fechar ? 'z' : '');
  }
  return saida;
}

/** Joins a relation's outer ways into closed rings. */
function aneis(relacao) {
  const pedacos = relacao.members.filter((m) => m.type === 'way' && m.role !== 'inner' && m.geometry).map((m) => [...m.geometry]);
  const prontos = [];
  while (pedacos.length) {
    let anel = pedacos.shift();
    let cresceu = true;
    const igual = (p, q) => p.lat === q.lat && p.lon === q.lon;
    while (!igual(anel[0], anel.at(-1)) && cresceu) {
      cresceu = false;
      for (let i = 0; i < pedacos.length; i++) {
        const p = pedacos[i];
        if (igual(anel.at(-1), p[0])) anel = anel.concat(p.slice(1));
        else if (igual(anel.at(-1), p.at(-1))) anel = anel.concat(p.slice(0, -1).reverse());
        else continue;
        pedacos.splice(i, 1);
        cresceu = true;
        break;
      }
    }
    prontos.push(anel);
  }
  return prontos;
}

function dentro([x, y], anel) {
  let dentro = false;
  for (let i = 0, j = anel.length - 1; i < anel.length; j = i++) {
    const [xi, yi] = anel[i];
    const [xj, yj] = anel[j];
    if (yi > y !== yj > y && x < ((xj - xi) * (y - yi)) / (yj - yi) + xi) dentro = !dentro;
  }
  return dentro;
}

const campus = dados.elements.find((e) => e.type === 'relation' && e.id === CAMPUS);
if (!campus) throw new Error('relação do campus ausente');
const contorno = aneis(campus);
const contornoXY = contorno.map((anel) => anel.map(projetar));
const noCampus = (geometria) => {
  const [sx, sy] = geometria.map(projetar).reduce(([a, b], [x, y]) => [a + x, b + y], [0, 0]);
  return contornoXY.some((anel) => dentro([sx / geometria.length, sy / geometria.length], anel));
};

const camadas = { agua: [], vias: [], viasInternas: [], trilhos: [], predios: [] };
for (const e of dados.elements) {
  const t = e.tags ?? {};
  if (e.type === 'relation' && t.natural === 'water') {
    camadas.agua.push(...aneis(e));
    continue;
  }
  if (e.type !== 'way' || !e.geometry) continue;
  if (t.natural === 'water') camadas.agua.push(e.geometry);
  else if (t.railway === 'rail') camadas.trilhos.push(e.geometry);
  else if (t.building && noCampus(e.geometry)) camadas.predios.push(e.geometry);
  else if (t.highway && new RegExp(VIAS).test(t.highway)) camadas.vias.push(e.geometry);
  else if (t.highway && new RegExp(VIAS_INTERNAS).test(t.highway) && noCampus(e.geometry)) camadas.viasInternas.push(e.geometry);
}

const [sul, oeste, norte, leste] = CAIXA;
const [x0, y0] = projetar({ lat: norte, lon: oeste });
const [x1, y1] = projetar({ lat: sul, lon: leste });
const saida = {
  fonte: '© OpenStreetMap',
  origem: ORIGEM,
  escala: [Math.round(KX), KY],
  caixa: [Math.round(x0), Math.round(y0), Math.round(x1), Math.round(y1)],
  campus: caminho(contorno, true, 3),
  agua: caminho(camadas.agua, true, 3),
  vias: caminho(camadas.vias, false, 3),
  viasInternas: caminho(camadas.viasInternas, false, 2),
  trilhos: caminho(camadas.trilhos, false, 3),
  predios: caminho(camadas.predios, true, 1.5),
};
mkdirSync('assets/mapa', { recursive: true });
writeFileSync('assets/mapa/campus.json', JSON.stringify(saida));
console.log(Object.fromEntries(Object.entries(saida).map(([k, v]) => [k, typeof v === 'string' ? v.length : v])));
