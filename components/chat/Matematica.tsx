/**
 * Matematica — the WebView KaTeX fallback for assistant text with LaTeX.
 *
 * Detection rule: display formulas `$$…$$`, or inline `$…$` with a small
 * anti-currency guard — a `$` glued to a letter/digit on the left ("R$ 10",
 * "US$ 5") or with edge whitespace is money/prose, not math. (The old site
 * kept single-dollar OFF precisely because R$ is money; here the
 * user-approved contract is `$`-delimited, so the guard does the
 * anti-false-positive work instead.)
 *
 * Rendering:
 * - only when `pronto` (the turn is COMPLETE): while streaming the raw text
 *   is shown — no streaming re-parse per delta;
 * - a self-contained HTML string with the KaTeX CDN (jsDelivr): the WebView
 *   runs browser JS, so the CDN script works and renders the formulas;
 * - if the CDN fails (offline) the page keeps the raw text AND the
 *   component falls back to styled raw text on the WebView's onError;
 * - if the WebView is unavailable (web platform, or the optional
 *   `react-native-webview` package is not installed — no new npm dep in
 *   this repo: the require is non-literal on purpose, so Metro bundles
 *   fine without the package and the module just fails to load at
 *   runtime) → styled raw text as well.
 */
import React, { useMemo, useState } from 'react';
import { Platform, Text, type StyleProp, type TextStyle, type ViewStyle } from 'react-native';

import { fonts, useTheme } from '../../theme';

/** The detection rule (exported so the contract is unit-visible). */
export function temDelimitadorMatematico(texto: string): boolean {
  if (/\$\$[\s\S]+\$\$/.test(texto)) return true;
  const candidatas = texto.match(/\$([^$\n]+)\$/g) ?? [];
  for (const candidata of candidatas) {
    const corpo = candidata.slice(1, -1);
    if (corpo === '' || /^\s|\s$/.test(corpo)) continue;
    const inicio = texto.indexOf(candidata);
    const antes = inicio > 0 ? texto.charAt(inicio - 1) : '';
    if (/[A-Za-z0-9]/.test(antes)) continue;
    return true;
  }
  return false;
}

function escaparHtml(s: string): string {
  return s
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

/**
 * The self-contained page. The LaTeX spans are tokenized HERE (in TS, where
 * the anti-currency guard lives) and marked with `data-math`; the inline
 * script — no regexes, nothing to escape through a template literal — just
 * asks KaTeX to render each marked span in place. When the CDN script
 * fails (`onerror` / `typeof katex === 'undefined'`) the flag is set and
 * the raw (escaped) text stays on screen.
 */
export function htmlKaTeX(texto: string): string {
  const re = /\$\$([\s\S]+?)\$\$|\$([^$\n]+)\$/g;
  let saida = '';
  let fim = 0;
  let n = 0;
  let m: RegExpExecArray | null;
  while ((m = re.exec(texto))) {
    const display = m[1] !== undefined;
    const bruto = display ? m[1] : m[2];
    const corpo = bruto.trim();
    let aceite = corpo !== '';
    if (!display && aceite) {
      if (/^\s|\s$/.test(bruto)) aceite = false;
      const antes = m.index > 0 ? texto.charAt(m.index - 1) : '';
      if (/[A-Za-z0-9]/.test(antes)) aceite = false;
    }
    if (!aceite) {
      re.lastIndex = m.index + 1;
      continue;
    }
    saida += escaparHtml(texto.slice(fim, m.index));
    saida += `<span data-math="${n}" class="${display ? 'kd' : 'ki'}">${escaparHtml(corpo)}</span>`;
    fim = re.lastIndex;
    n += 1;
  }
  saida += escaparHtml(texto.slice(fim));

  return `<!doctype html>
<html>
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<link rel="stylesheet" href="https://cdn.jsdelivr.net/npm/katex@0.16.11/dist/katex.min.css" onerror="window.__katexFalhou=true">
<style>
  body { margin: 0; padding: 12px 14px; background: #fff; color: #111;
         font: 16px/1.5 -apple-system, 'Segoe UI', Roboto, Helvetica, sans-serif;
         white-space: pre-wrap; word-wrap: break-word; }
  .katex { font-size: 1.15em; }
  .katex-display { overflow-x: auto; overflow-y: hidden; padding: 4px 0; }
</style>
</head>
<body>
${saida}
<script src="https://cdn.jsdelivr.net/npm/katex@0.16.11/dist/katex.min.js" onerror="window.__katexFalhou=true"></script>
<script>
(function () {
  if (typeof katex === 'undefined') { window.__katexFalhou = true; return; }
  var els = document.querySelectorAll('[data-math]');
  for (var i = 0; i < els.length; i++) {
    var el = els[i];
    katex.render(el.textContent, el, {
      displayMode: el.classList.contains('kd'),
      throwOnError: false
    });
  }
  window.__pronto = true;
})();
</script>
</body>
</html>`;
}

/** The minimal WebView surface this component needs (react-native-webview
 *  compatible). Typed loosely on purpose: the package is OPTIONAL. */
type WebViewProps = {
  source: { html: string };
  originWhitelist?: string[];
  onError?: (e: { nativeEvent?: { description?: string } }) => void;
  style?: StyleProp<ViewStyle>;
};
type WebViewCtor = React.ComponentType<WebViewProps>;

let webviewMemo: WebViewCtor | null | undefined;

/**
 * Tries to load the (optional) `react-native-webview` package. The
 * non-literal require keeps Metro from resolving the missing package at
 * bundle time; on a runtime where the package exists the module loads.
 */
function webviewDisponivel(): WebViewCtor | null {
  if (webviewMemo !== undefined) return webviewMemo;
  let mod: unknown = null;
  try {
    const nome = 'react-native-' + 'webview';
    // eslint-disable-next-line @typescript-eslint/no-var-requires
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    const req = require(nome) as { default?: unknown; WebView?: unknown };
    mod = req?.default ?? req?.WebView ?? null;
  } catch {
    mod = null;
  }
  webviewMemo =
    typeof mod === 'function' ||
    (typeof mod === 'object' && mod !== null && 'propTypes' in (mod as object))
      ? (mod as WebViewCtor)
      : null;
  return webviewMemo;
}

/**
 * True when the KaTeX path can actually run: a native platform with the
 * optional `react-native-webview` package installed. components/chat/Resposta
 * asks BEFORE choosing a renderer, so that when the answer is markdown with a
 * formula in it the markdown renderer wins instead of this component's plain
 * raw-text fallback.
 */
export function suportaKaTeX(): boolean {
  if (Platform.OS === 'web') return false;
  return webviewDisponivel() !== null;
}

export type MatematicaProps = {
  texto: string;
  /** The turn is complete (math renders only on the final text). */
  pronto: boolean;
  style?: StyleProp<TextStyle>;
};

export function Matematica({ texto, pronto, style }: MatematicaProps) {
  const { colors, typography } = useTheme();
  const [falhou, setFalhou] = useState(false);

  const WebView = useMemo<WebViewCtor | null>(() => {
    if (!pronto || falhou) return null;
    if (Platform.OS === 'web') return null; // no WebView on web: raw text
    return webviewDisponivel();
  }, [pronto, falhou]);

  const html = useMemo(
    () => (pronto && WebView && temDelimitadorMatematico(texto) ? htmlKaTeX(texto) : ''),
    [pronto, WebView, texto],
  );

  if (html === '' || !WebView) {
    // Raw path: while streaming, no math detected, web platform, missing
    // package, or the WebView/CDN failed.
    return (
      <Text
        style={[
          {
            color: colors.foreground,
            fontFamily: fonts.body,
            fontSize: typography.base.fontSize,
            lineHeight: typography.base.lineHeight,
          },
          style,
        ]}
      >
        {texto}
      </Text>
    );
  }
  return (
    <WebView
      source={{ html }}
      originWhitelist={['https://cdn.jsdelivr.net', 'https://*.jsdelivr.net']}
      onError={(e) => {
        if (e?.nativeEvent?.description) {
          console.warn('[Matematica] WebView falhou:', e.nativeEvent.description);
        }
        setFalhou(true);
      }}
      style={{ flex: 1 }}
    />
  );
}
