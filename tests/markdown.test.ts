import { blocos, htmlDaResposta, selar, temMatematica } from '../lib/markdown';

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
