/** Web: the finished answer as KaTeX HTML in the page (stylesheet served from /katex by scripts/katex.mjs). */
import React, { useEffect, useMemo } from 'react';

import { FONTES_APP, cssDaResposta, cssDaTabela, htmlDaResposta } from '../../lib/markdown';
import { useTheme } from '../../theme';

export { temMatematica } from '../../lib/markdown';

export function Matematica({ texto }: { texto: string }) {
  const { colors } = useTheme();
  useEffect(() => {
    if (document.getElementById('katex-css')) return;
    const link = Object.assign(document.createElement('link'), { id: 'katex-css', rel: 'stylesheet', href: '/katex/katex.min.css' });
    document.head.appendChild(link);
  }, []);
  // Type and table rules follow the theme, so they ship with the answer instead of the static KaTeX sheet.
  const html = useMemo(() => `<style>${cssDaResposta(colors, FONTES_APP, '.uspapo-resposta')}${cssDaTabela(colors.foreground)}</style>${htmlDaResposta(texto)}`,
    [texto, colors]);
  return React.createElement('div', {
    className: 'uspapo-resposta',
    style: { overflowWrap: 'anywhere' },
    dangerouslySetInnerHTML: { __html: html },
  });
}
