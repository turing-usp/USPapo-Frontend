/** Markdown helpers: streaming blocks and sealing, and Markdown + LaTeX (\( \), \[ \], $$ $$) to safe HTML. */
import katex from 'katex';
import MarkdownIt from 'markdown-it';
import texmath from 'markdown-it-texmath';

export const KATEX_VERSAO = '0.18.7';

// Single `$` is money in pt-BR ("R$ 10"): only the unambiguous delimiters count.
export const temMatematica = (texto: string) => /\\\(|\\\[|\$\$[^$]+\$\$/.test(texto);

let md: MarkdownIt | null = null;

export function htmlDaResposta(texto: string): string {
  md ??= new MarkdownIt({ html: false, linkify: true, breaks: false }).use(texmath, {
    engine: katex,
    delimiters: ['brackets', 'beg_end'],
    katexOptions: { throwOnError: false, trust: false, maxExpand: 200, maxSize: 20 },
  });
  md.renderer.rules.link_open = (tokens, i, options, _env, self) => {
    tokens[i].attrSet('target', '_blank');
    tokens[i].attrSet('rel', 'noopener noreferrer');
    return self.renderToken(tokens, i, options);
  };
  return md.render(texto.replace(/\$\$([\s\S]+?)\$\$/g, (_m, corpo: string) => `\\[${corpo}\\]`));
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
