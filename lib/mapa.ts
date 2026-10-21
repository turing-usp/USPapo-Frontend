/**
 * The inline map widget's data: the ride's geometry (GET /api/mapa, cached per reference) and the
 * campus base layer bundled with the app (assets/mapa/campus.json, from scripts/mapa-campus.mjs).
 * Everything is drawn in the base layer's local meters: x east, y south, as SVG expects.
 */
import { backendUrl } from './api';
import { sessaoAtual } from './auth';
import base from '../assets/mapa/campus.json';

export type Ponto = [number, number];
/** What the backend sends: the ride as an encoded polyline, the two stops and the two places. */
export type Geometria = { rota: string; embarque: Ponto; desembarque: Ponto; origem: Ponto | null; destino: Ponto | null };
export type BaseDoMapa = typeof base;
export const BASE: BaseDoMapa = base;

const CAMPOS = ['linha', 'de', 'ate', 'origem', 'destino'] as const;
const pedidos = new Map<string, Promise<Geometria | null>>();

/** The ride's geometry, or null when the reference is gone (404) or cannot be read. Failures are not cached. */
export function buscarMapa(campos: Record<string, string>): Promise<Geometria | null> {
  const consulta = CAMPOS.filter((c) => campos[c]).map((c) => `${c}=${encodeURIComponent(campos[c])}`).join('&');
  const guardado = pedidos.get(consulta);
  if (guardado) return guardado;
  const pedido = (async () => {
    const { token } = await sessaoAtual();
    const res = await fetch(`${backendUrl()}/api/mapa?${consulta}`, { headers: { Authorization: `Bearer ${token}` } });
    if (res.status === 404) return null;
    if (!res.ok) throw new Error(`mapa ${res.status}`);
    return (await res.json()) as Geometria;
  })();
  pedidos.set(consulta, pedido);
  pedido.catch(() => pedidos.delete(consulta));
  return pedido;
}

/** Google's encoded polyline (precision 5) -> [lat, lon] points. */
export function decodificar(polyline: string): Ponto[] {
  const pontos: Ponto[] = [];
  let [i, lat, lon] = [0, 0, 0];
  while (i < polyline.length) {
    const valores: number[] = [];
    for (let eixo = 0; eixo < 2; eixo++) {
      let [deslocamento, resultado, byte] = [0, 0, 0];
      do {
        byte = polyline.charCodeAt(i++) - 63;
        resultado |= (byte & 0x1f) << deslocamento;
        deslocamento += 5;
      } while (byte >= 0x20 && i < polyline.length);
      valores.push(resultado & 1 ? ~(resultado >> 1) : resultado >> 1);
    }
    lat += valores[0];
    lon += valores[1];
    pontos.push([lat / 1e5, lon / 1e5]);
  }
  return pontos;
}

/** [lat, lon] -> the base layer's meters. */
export function projetar([lat, lon]: Ponto): Ponto {
  return [(lon - BASE.origem[1]) * BASE.escala[0], (BASE.origem[0] - lat) * BASE.escala[1]];
}

/**
 * The viewBox showing `pontos` (meters) with a margin, stretched to the box's `aspecto` (width /
 * height) so nothing is distorted. Never tighter than `minimo` meters across: a two-stop ride
 * should still show the streets around it.
 */
export function enquadrar(pontos: Ponto[], aspecto: number, minimo = 600): [number, number, number, number] {
  const xs = pontos.map((p) => p[0]);
  const ys = pontos.map((p) => p[1]);
  const [cx, cy] = [(Math.min(...xs) + Math.max(...xs)) / 2, (Math.min(...ys) + Math.max(...ys)) / 2];
  let largura = Math.max(minimo, (Math.max(...xs) - Math.min(...xs)) * 1.25);
  let altura = Math.max(minimo / aspecto, (Math.max(...ys) - Math.min(...ys)) * 1.25);
  if (largura / altura > aspecto) altura = largura / aspecto;
  else largura = altura * aspecto;
  return [cx - largura / 2, cy - altura / 2, largura, altura];
}

/** SVG path data through `pontos` (meters). */
export function linha(pontos: Ponto[]): string {
  return pontos.map(([x, y], i) => `${i ? 'L' : 'M'}${x.toFixed(1)} ${y.toFixed(1)}`).join('');
}
