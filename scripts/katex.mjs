// Copies the KaTeX stylesheet and fonts into public/katex (web serves them same-origin under the CSP).
import { cpSync, mkdirSync } from 'node:fs';
mkdirSync('public/katex', { recursive: true });
cpSync('node_modules/katex/dist/katex.min.css', 'public/katex/katex.min.css');
cpSync('node_modules/katex/dist/fonts', 'public/katex/fonts', { recursive: true, filter: (f) => !/\.(ttf|woff)$/.test(f) });
