/**
 * Inline widgets: a fenced block in an answer that the app draws instead of printing.
 *
 *     ```uspapo-mapa
 *     linha=8084-10 de=120010354 ate=1211429 origem=p1 destino=poli
 *     ```
 *
 * The block travels inside the answer text (the chat stream did not change) and is saved with it,
 * so a reopened conversation draws it again. The backend sends only a short reference; the widget
 * fetches what it needs (the map: GET /api/mapa) and draws it. Copy, share and the KaTeX path drop
 * the blocks. Today: `mapa` and `grade`; images and videos will add their own `tipo`.
 */
import { backendUrl } from './api';
import { sessaoAtual } from './auth';

export const PREFIXO_WIDGET = 'uspapo-';

export type Widget = { tipo: string; campos: Record<string, string> };

/** The widget a fence (`info` = its language) describes, or null for an ordinary code block. */
export function lerWidget(info: string, corpo: string): Widget | null {
  const lingua = info.trim().split(/\s+/)[0] ?? '';
  if (!lingua.startsWith(PREFIXO_WIDGET)) return null;
  const campos: Record<string, string> = {};
  for (const par of corpo.trim().split(/\s+/)) {
    const igual = par.indexOf('=');
    if (igual > 0) campos[par.slice(0, igual)] = par.slice(igual + 1);
  }
  return { tipo: lingua.slice(PREFIXO_WIDGET.length), campos };
}

const BLOCO = /\n*```uspapo-[a-z]+\n[^`]*?\n```[ \t]*(?=\n|$)/g;

/** [the text without its widget blocks, the blocks]: KaTeX typesets the first, the app draws the second. */
export function separarWidgets(texto: string): [string, string] {
  const blocos = (texto.match(BLOCO) ?? []).map((b) => b.trim());
  return [texto.replace(BLOCO, '').trim(), blocos.join('\n\n')];
}

/** The text without its widget blocks (what is copied or shared). */
export function semWidgets(texto: string): string {
  return separarWidgets(texto)[0];
}

const pedidos = new Map<string, Promise<unknown>>();

/**
 * What a widget's reference stands for, from the backend (`rota` + query), cached per reference:
 * null when the reference is gone (404). Failures are not cached, so reopening tries again.
 */
export function buscarDadosDoWidget<T>(rota: string, consulta: string): Promise<T | null> {
  const chave = `${rota}?${consulta}`;
  const guardado = pedidos.get(chave);
  if (guardado) return guardado as Promise<T | null>;
  const pedido = (async () => {
    const { token } = await sessaoAtual();
    const res = await fetch(`${backendUrl()}${chave}`, { headers: { Authorization: `Bearer ${token}` } });
    if (res.status === 404) return null;
    if (!res.ok) throw new Error(`${rota} ${res.status}`);
    return (await res.json()) as T;
  })();
  pedidos.set(chave, pedido);
  pedido.catch(() => pedidos.delete(chave));
  return pedido;
}
