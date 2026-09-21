/**
 * Puts the app's own identity in the exported web page's <head>.
 *
 * Why a post-export step and not `app/+html.tsx`: that file is a
 * STATIC-RENDERING feature. This app ships `web.output: "single"` (one SPA
 * shell, with vercel.json rewriting every route to it), and in that mode
 * Expo builds `index.html` from its own fixed template and never looks at
 * `+html`. The template gives you `lang="en"` and, at most, one
 * `/favicon.ico` — so the site had no app icon: the tab, the bookmark and an
 * iOS "add to home screen" all fell back to something that was not the icon
 * on the phone.
 *
 * What it injects, and only this:
 *
 *   lang="pt-BR"      every string in the app is pt-BR; it drives
 *                     hyphenation and how a screen reader pronounces it
 *   icon links        the real mark at every size a browser asks for. The
 *                     files are generated from assets/images/icon.png — the
 *                     SAME 1024px master the Android launcher icon uses —
 *                     and live in public/, which Expo copies to the site
 *                     root verbatim
 *   theme-color       so the Android browser chrome matches the canvas
 *                     instead of framing the app in white
 *   manifest          what makes an installed shortcut use the icon and name
 *   base background   the canvas colour before React mounts, so a cold load
 *                     does not flash white over the dark scheme
 *
 * Idempotent: a marker comment means the file was already processed.
 * Never fails the build — a missing index.html is reported and skipped, so
 * `expo export` stays the thing that decides whether the build worked.
 */
import { readFileSync, writeFileSync, existsSync } from 'node:fs';
import { join } from 'node:path';

const SAIDA = process.argv[2] ?? 'dist';
const ARQUIVO = join(SAIDA, 'index.html');
const MARCA = '<!-- uspapo:head -->';

/** theme/index.tsx — colors.light.canvas / colors.dark.canvas. */
const CANVAS_CLARO = '#dde4f6';
const CANVAS_ESCURO = '#03042c';

const CABECA = `${MARCA}
    <link rel="icon" href="/favicon.ico" sizes="any" />
    <link rel="icon" type="image/png" sizes="192x192" href="/icon-192.png" />
    <link rel="icon" type="image/png" sizes="512x512" href="/icon-512.png" />
    <link rel="apple-touch-icon" href="/apple-touch-icon.png" />
    <link rel="manifest" href="/manifest.webmanifest" />
    <meta name="theme-color" media="(prefers-color-scheme: light)" content="${CANVAS_CLARO}" />
    <meta name="theme-color" media="(prefers-color-scheme: dark)" content="${CANVAS_ESCURO}" />
    <meta name="description" content="USPapo — assistente inteligente para navegar pela USP, do Turing USP." />
    <style>
      html, body { background-color: ${CANVAS_CLARO}; }
      @media (prefers-color-scheme: dark) {
        html, body { background-color: ${CANVAS_ESCURO}; }
      }
    </style>`;

if (!existsSync(ARQUIVO)) {
  console.warn(`[web-head] ${ARQUIVO} não existe; nada a fazer.`);
  process.exit(0);
}

let html = readFileSync(ARQUIVO, 'utf8');

if (html.includes(MARCA)) {
  console.log('[web-head] já aplicado.');
  process.exit(0);
}

html = html.replace('<html lang="en">', '<html lang="pt-BR">');
// Expo may or may not have emitted its own icon link; ours replace it.
html = html.replace(/<link rel="icon"[^>]*\/?>/g, '');
html = html.replace('</head>', `  ${CABECA}\n  </head>`);

writeFileSync(ARQUIVO, html);
console.log(`[web-head] cabeçalho aplicado em ${ARQUIVO}.`);
