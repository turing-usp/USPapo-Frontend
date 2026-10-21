// Post-export: puts the app identity in dist/index.html (web.output "single" ignores app/+html.tsx).
import { existsSync, readFileSync, writeFileSync } from 'node:fs';

// The CSP in vercel.json names the Supabase host (the project is chosen by EXPO_PUBLIC_SUPABASE_URL):
// a build for another project (USPapo's own, docs: USPapo-Backend/docs/supabase-proprio.md) whose
// host the CSP does not allow would ship a site that cannot sign anyone in. Fail the build instead.
const supabase = process.env.EXPO_PUBLIC_SUPABASE_URL;
if (supabase && !/^https?:\/\/(localhost|127\.0\.0\.1)(:|\/|$)/.test(supabase)) {
  const politica = JSON.parse(readFileSync(new URL('../vercel.json', import.meta.url), 'utf8')).headers
    .flatMap((h) => h.headers).find((h) => h.key === 'Content-Security-Policy')?.value ?? '';
  const origem = new URL(supabase).origin;
  const conecta = /connect-src([^;]*)/.exec(politica)?.[1].trim().split(/\s+/) ?? [];
  if (!conecta.includes(origem)) {
    console.error(`vercel.json: a CSP (connect-src e img-src) não libera ${origem}, o Supabase deste build.`);
    process.exit(1);
  }
}

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
    <meta name="theme-color" media="(prefers-color-scheme: light)" content="#ededf5" />
    <meta name="theme-color" media="(prefers-color-scheme: dark)" content="#272830" />
    <meta name="description" content="USPapo — assistente inteligente para navegar pela USP, do Turing USP." />
    <style>html,body{background-color:#ededf5}@media (prefers-color-scheme:dark){html,body{background-color:#272830}}</style>`;

html = html.replace('<html lang="en">', '<html lang="pt-BR">').replace(/<link rel="icon"[^>]*\/?>/g, '').replace('</head>', `  ${cabeca}\n  </head>`);
writeFileSync(arquivo, html);
