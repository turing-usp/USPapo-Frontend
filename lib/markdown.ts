/**
 * Markdown helpers: streaming blocks and sealing, `<br>` line breaks, table column widths,
 * and Markdown + LaTeX (\( \), \[ \], $$ $$) to safe HTML.
 */
import katex from 'katex';
import MarkdownIt from 'markdown-it';
import texmath from 'markdown-it-texmath';

export const KATEX_VERSAO = '0.18.7';

// Single `$` is money in pt-BR ("R$ 10"): only the unambiguous delimiters count.
export const temMatematica = (texto: string) => /\\\(|\\\[|\$\$[^$]+\$\$/.test(texto);

const BR = /<\/?br\s*\/?>/i;

/**
 * `<br>` (also `<br/>` and `</br>`, which models put in table cells) as a hard break. Raw HTML stays
 * off, so it is matched in text tokens; code spans are separate tokens and keep it literal.
 */
export function quebras(md: MarkdownIt): void {
  md.core.ruler.push('quebras', (state) => {
    for (const bloco of state.tokens) {
      if (bloco.type !== 'inline' || !bloco.children) continue;
      bloco.children = bloco.children.flatMap((token) => {
        if (token.type !== 'text' || !BR.test(token.content)) return [token];
        return token.content.split(new RegExp(BR.source, 'gi')).flatMap((parte, i) => {
          const saida = i ? [new state.Token('hardbreak', 'br', 0)] : [];
          if (parte) saida.push(Object.assign(new state.Token('text', '', 0), { content: parte }));
          return saida;
        });
      });
    }
  });
}

let md: MarkdownIt | null = null;

export function htmlDaResposta(texto: string): string {
  md ??= new MarkdownIt({ html: false, linkify: true, breaks: false }).use(texmath, {
    engine: katex,
    delimiters: ['brackets', 'beg_end'],
    katexOptions: { throwOnError: false, trust: false, maxExpand: 200, maxSize: 20 },
  }).use(quebras);
  md.renderer.rules.link_open = (tokens, i, options, _env, self) => {
    tokens[i].attrSet('target', '_blank');
    tokens[i].attrSet('rel', 'noopener noreferrer');
    return self.renderToken(tokens, i, options);
  };
  // Wide tables scroll inside their own box instead of widening the answer.
  md.renderer.rules.table_open = () => '<div class="tabela"><table>\n';
  md.renderer.rules.table_close = () => '</table></div>\n';
  return md.render(texto.replace(/\$\$([\s\S]+?)\$\$/g, (_m, corpo: string) => `\\[${corpo}\\]`));
}

/** Table ink per scheme, shared by the native table and the KaTeX HTML one. */
export function tintasDaTabela(escuro: boolean) {
  return escuro
    ? { linha: 'rgba(255,255,255,0.14)', cabecalho: 'rgba(255,255,255,0.08)', listra: 'rgba(255,255,255,0.035)' }
    : { linha: 'rgba(11,16,48,0.14)', cabecalho: 'rgba(11,16,48,0.06)', listra: 'rgba(11,16,48,0.03)' };
}

/** Stylesheet for tables in answer HTML (KaTeX path). */
export function cssDaTabela(escuro: boolean): string {
  const cor = tintasDaTabela(escuro);
  return `.tabela{overflow-x:auto;margin:0 0 12px;border:1px solid ${cor.linha};border-radius:12px}`
    + `.tabela table{border-collapse:collapse;min-width:100%;font-size:14px;line-height:20px}`
    + `.tabela th,.tabela td{padding:8px 12px;text-align:left;vertical-align:top;min-width:56px;max-width:280px;border:0;border-left:1px solid ${cor.linha}}`
    + `.tabela th:first-child,.tabela td:first-child{border-left:0}`
    + `.tabela tr{border-bottom:1px solid ${cor.linha}}.tabela tbody tr:last-child{border-bottom:0}`
    + `.tabela thead{background:${cor.cabecalho}}.tabela tbody tr:nth-child(even){background:${cor.listra}}`;
}

/** Per column, in characters: the longest line and the longest word of any cell. */
export type MedidaDaColuna = { linha: number; palavra: number };

export function medirColunas(linhas: string[][]): MedidaDaColuna[] {
  const colunas: MedidaDaColuna[] = [];
  for (const linha of linhas) {
    linha.forEach((celula, j) => {
      const maiorLinha = Math.max(0, ...celula.split('\n').map((l) => l.trim().length));
      const maiorPalavra = Math.max(0, ...celula.split(/\s+/).map((p) => p.length));
      colunas[j] = { linha: Math.max(colunas[j]?.linha ?? 0, maiorLinha), palavra: Math.max(colunas[j]?.palavra ?? 0, maiorPalavra) };
    });
  }
  return colunas;
}

export type Metrica = { caractere: number; folga: number; minimo: number; maximo: number; conforto: number };

/**
 * Column widths (dp) for `disponivel` dp, like a browser's auto table layout: content widths filling
 * the space when they fit; else shrunk toward each column's floor (its longest word, and never below
 * `conforto` for wrapping text); else comfortable widths in a horizontal scroll.
 */
export function distribuirColunas(colunas: MedidaDaColuna[], disponivel: number, m: Metrica): { larguras: number[]; rola: boolean } {
  const limitar = (v: number, min: number, max: number) => Math.min(max, Math.max(min, v));
  const soma = (xs: number[]) => xs.reduce((a, b) => a + b, 0);
  const natural = colunas.map((c) => limitar(c.linha * m.caractere + m.folga, m.minimo, m.maximo));
  const piso = colunas.map((c, j) => limitar(Math.max(c.palavra * m.caractere, Math.min(c.linha * m.caractere, m.conforto)) + m.folga, m.minimo, natural[j]));
  const [n, p] = [soma(natural), soma(piso)];
  if (n <= disponivel) return { larguras: natural.map((w) => Math.floor((w * disponivel) / n)), rola: false };
  if (p <= disponivel) {
    const t = (disponivel - p) / (n - p);
    return { larguras: piso.map((w, j) => Math.floor(w + (natural[j] - w) * t)), rola: false };
  }
  // Scrolling: no column wider than 60% of the box, so the next one always peeks in.
  const teto = Math.max(m.minimo, Math.min(m.maximo, disponivel * 0.6));
  return { larguras: natural.map((w) => Math.floor(Math.min(w, teto))), rola: true };
}

export function blocos(texto: string): string[] {
  const saida: string[] = [];
  let atual: string[] = [];
  let cerca = false;
  for (const linha of texto.split('\n')) {
    if (/^\s*(```|~~~)/.test(linha)) cerca = !cerca;
    if (!cerca && !linha.trim()) {
      if (atual.length) saida.push(atual.join('\n'));
      atual = [];
    } else {
      atual.push(linha);
    }
  }
  if (atual.length) saida.push(atual.join('\n'));
  return saida;
}

/** Closes a bold/inline-code marker the stream has not closed yet, so it never shows raw. */
export function selar(texto: string): string {
  if (/^\s*(```|~~~)/m.test(texto)) return texto; // fences are sealed by the renderer
  let saida = texto;
  if (((saida.match(/`/g) ?? []).length) % 2) saida += '`';
  if (((saida.replace(/`[^`]*`/g, '').match(/\*\*/g) ?? []).length) % 2) saida = saida.replace(/\*\*\s*$/, '') + (saida.trimEnd().endsWith('**') ? '' : '**');
  return saida;
}
