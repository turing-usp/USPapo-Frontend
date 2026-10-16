/** Native: the finished answer as KaTeX HTML inside an auto-sized WebView (links open outside). */
import React, { useMemo, useState } from 'react';
import { Linking } from 'react-native';
import { WebView } from 'react-native-webview';

import { FONTES_WEB, KATEX_VERSAO, cssDaResposta, cssDaTabela, htmlDaResposta } from '../../lib/markdown';
import { useTheme } from '../../theme';

export { temMatematica } from '../../lib/markdown';

export function Matematica({ texto }: { texto: string }) {
  const { colors } = useTheme();
  const [altura, setAltura] = useState(60);
  // #r is a flow-root so the last block's margin counts; re-measured once KaTeX's CSS and fonts load.
  // The WebView cannot see the app's fonts, so the manual's faces come from Google Fonts here. No text
  // selection: a long press opens the answer's menu (Copiar, Compartilhar), as on any other answer.
  const html = useMemo(() => `<!doctype html><html><head><meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<link rel="stylesheet" href="https://cdn.jsdelivr.net/npm/katex@${KATEX_VERSAO}/dist/katex.min.css">
<link rel="stylesheet" href="https://fonts.googleapis.com/css2?family=Changa:wght@500&family=M+PLUS+1p:wght@400;700&family=Roboto+Mono&display=swap">
<style>body{margin:0;background:transparent;-webkit-user-select:none;user-select:none;-webkit-touch-callout:none}${cssDaResposta(colors, FONTES_WEB, '#r')}${cssDaTabela(colors.foreground)}
.katex-display{overflow-x:auto;overflow-y:hidden}
#r{display:flow-root}</style>
</head><body><div id="r">${htmlDaResposta(texto)}</div><script>
const el=document.getElementById('r');
const r=()=>window.ReactNativeWebView.postMessage(String(Math.ceil(el.getBoundingClientRect().height)));
new ResizeObserver(r).observe(el);document.fonts.ready.then(r);addEventListener('load',r);r();</script></body></html>`, [texto, colors]);
  return (
    <WebView
      source={{ html }}
      originWhitelist={['about:blank']}
      style={{ height: altura, backgroundColor: 'transparent' }}
      scrollEnabled={false}
      onMessage={(e) => setAltura(Math.max(20, Number(e.nativeEvent.data) || 0))}
      onShouldStartLoadWithRequest={(req) => {
        if (req.url === 'about:blank' || req.url.startsWith('data:')) return true;
        void Linking.openURL(req.url).catch(() => undefined);
        return false;
      }}
    />
  );
}
