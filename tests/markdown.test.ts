import { blocos, distribuirColunas, htmlDaResposta, medirColunas, selar, temMatematica } from '../lib/markdown';

test('blocks split on blank lines but keep fences whole', () => {
  expect(blocos('a\nb\n\nc\n\n```\nx\n\ny\n```\n\nz')).toEqual(['a\nb', 'c', '```\nx\n\ny\n```', 'z']);
});

test('unclosed bold and inline code are sealed while streaming', () => {
  expect(selar('**Cardá')).toBe('**Cardá**');
  expect(selar('use `npm')).toBe('use `npm`');
  expect(selar('**ok** e mais')).toBe('**ok** e mais');
});

test('only unambiguous math delimiters count (R$ is money)', () => {
  expect(temMatematica('Custa R$ 10 e R$ 20')).toBe(false);
  expect(temMatematica('A área é \\(\\pi r^2\\)')).toBe(true);
  expect(temMatematica('$$x^2$$')).toBe(true);
});

test('answer HTML escapes raw HTML and renders KaTeX', () => {
  const html = htmlDaResposta('<script>alert(1)</script> e \\(x^2\\) [link](javascript:alert(1))');
  expect(html).not.toContain('<script>');
  expect(html).toContain('&lt;script&gt;');
  expect(html).toContain('katex');
  expect(html).not.toContain('href="javascript:');
});

test('<br> variants become line breaks, except inside code spans', () => {
  const html = htmlDaResposta('| a | b |\n|---|---|\n| x<br>y | z</br>w<br/>v |\n\n`a<br>b`');
  expect(html).toContain('x<br>\ny');
  expect(html).toContain('z<br>\nw<br>\nv');
  expect(html).toContain('<code>a&lt;br&gt;b</code>');
  expect(html).toContain('<div class="tabela"><table>');
});

const METRICA = { caractere: 8, folga: 24, minimo: 56, maximo: 280, conforto: 120 };

test('columns are measured by their longest line and word', () => {
  expect(medirColunas([['Dia', 'Horário'], ['Segunda\nTerça', 'das 8h às 10h']])).toEqual([
    { linha: 7, palavra: 7 }, { linha: 13, palavra: 7 },
  ]);
});

test('a table that fits fills the width in content proportion', () => {
  const { larguras, rola } = distribuirColunas([{ linha: 4, palavra: 4 }, { linha: 12, palavra: 6 }], 400, METRICA);
  expect(rola).toBe(false);
  expect(larguras[0] + larguras[1]).toBeLessThanOrEqual(400);
  expect(larguras[1]).toBeGreaterThan(larguras[0]);
});

test('a wide table wraps its text columns down to a comfortable floor before scrolling', () => {
  const colunas = [{ linha: 5, palavra: 5 }, { linha: 60, palavra: 10 }, { linha: 60, palavra: 9 }];
  const cabe = distribuirColunas(colunas, 360, METRICA);
  expect(cabe.rola).toBe(false);
  expect(Math.min(...cabe.larguras.slice(1))).toBeGreaterThanOrEqual(120 + 24);
  const estreita = distribuirColunas([...colunas, { linha: 60, palavra: 12 }], 320, METRICA);
  expect(estreita.rola).toBe(true);
  expect(Math.max(...estreita.larguras)).toBeLessThanOrEqual(320 * 0.6);
});
