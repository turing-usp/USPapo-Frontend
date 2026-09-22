/** Web: the finished answer as KaTeX HTML in the page (stylesheet served from /katex by scripts/katex.mjs). */
import React, { useEffect, useMemo } from 'react';

import { htmlDaResposta } from '../../lib/markdown';
import { useTheme } from '../../theme';

export { temMatematica } from '../../lib/markdown';

export function Matematica({ texto }: { texto: string }) {
  const { colors } = useTheme();
  useEffect(() => {
    if (document.getElementById('katex-css')) return;
    const link = Object.assign(document.createElement('link'), { id: 'katex-css', rel: 'stylesheet', href: '/katex/katex.min.css' });
    document.head.appendChild(link);
  }, []);
  const html = useMemo(() => htmlDaResposta(texto), [texto]);
  return React.createElement('div', {
    className: 'uspapo-resposta',
    style: { color: colors.foreground, font: '18px/26px Roboto, sans-serif', overflowWrap: 'anywhere' },
    dangerouslySetInnerHTML: { __html: html },
  });
}
