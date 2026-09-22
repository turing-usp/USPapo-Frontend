// Post-export: puts the app identity in dist/index.html (web.output "single" ignores app/+html.tsx).
import { existsSync, readFileSync, writeFileSync } from 'node:fs';

const arquivo = `${process.argv[2] ?? 'dist'}/index.html`;
const marca = '<!-- uspapo:head -->';
if (!existsSync(arquivo)) process.exit(0);
let html = readFileSync(arquivo, 'utf8');
if (html.includes(marca)) process.exit(0);

const cabeca = `${marca}
    <link rel="icon" type="image/svg+xml" href="/favicon.svg" />
    <link rel="icon" href="/favicon.ico" sizes="16x16 32x32 48x48" />
    <link rel="apple-touch-icon" href="/apple-touch-icon.png" />
    <link rel="manifest" href="/manifest.webmanifest" />
    <meta name="theme-color" media="(prefers-color-scheme: light)" content="#dde4f6" />
    <meta name="theme-color" media="(prefers-color-scheme: dark)" content="#03042c" />
    <meta name="description" content="USPapo — assistente inteligente para navegar pela USP, do Turing USP." />
    <style>html,body{background-color:#dde4f6}@media (prefers-color-scheme:dark){html,body{background-color:#03042c}}</style>`;

html = html.replace('<html lang="en">', '<html lang="pt-BR">').replace(/<link rel="icon"[^>]*\/?>/g, '').replace('</head>', `  ${cabeca}\n  </head>`);
writeFileSync(arquivo, html);
