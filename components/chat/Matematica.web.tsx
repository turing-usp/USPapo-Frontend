/** Web: the finished answer as KaTeX HTML in the page (stylesheet served from /katex by scripts/katex.mjs). */
import React, { useEffect, useMemo } from 'react';

import { cssDaTabela, htmlDaResposta } from '../../lib/markdown';
import { useTheme } from '../../theme';

export { temMatematica } from '../../lib/markdown';

export function Matematica({ texto }: { texto: string }) {
  const { colors, escuro } = useTheme();
  useEffect(() => {
    if (document.getElementById('katex-css')) return;
    const link = Object.assign(document.createElement('link'), { id: 'katex-css', rel: 'stylesheet', href: '/katex/katex.min.css' });
    document.head.appendChild(link);
  }, []);
  // Table rules follow the theme, so they ship with the answer instead of the static KaTeX sheet.
  const html = useMemo(() => `<style>${cssDaTabela(escuro)}</style>${htmlDaResposta(texto)}`, [texto, escuro]);
  return React.createElement('div', {
    className: 'uspapo-resposta',
    style: { color: colors.foreground, font: '18px/26px Roboto, sans-serif', overflowWrap: 'anywhere' },
    dangerouslySetInnerHTML: { __html: html },
  });
}
