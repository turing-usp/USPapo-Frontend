import { escolher, urlDaImagem, type Comunicado } from '../lib/comunicados';

jest.mock('../lib/supabase', () => ({ supabase: {} }));

const c = (id: string, tipo: Comunicado['tipo'], pilula: string | null = null): Comunicado =>
  ({ id, tipo, titulo: id, texto: '', imagens: [], pilula });

test('the newest unseen novidade and the newest aviso not hidden are picked', () => {
  const lista = [c('n2', 'novidade'), c('a2', 'aviso', 'Manutenção hoje'), c('n1', 'novidade'), c('a1', 'aviso', 'Antigo')];
  expect(escolher(lista, [])).toEqual({ novidade: lista[0], aviso: lista[1] });
  expect(escolher(lista, ['n2', 'a2'])).toEqual({ novidade: lista[2], aviso: lista[3] });
  expect(escolher([c('a3', 'aviso')], [])).toEqual({ novidade: null, aviso: null }); // an aviso needs its pill text
});

test('images are bucket paths or full URLs', () => {
  expect(urlDaImagem('https://exemplo.com/a.png')).toBe('https://exemplo.com/a.png');
  expect(urlDaImagem('/v0.2/tela nova.png')).toBe('http://supabase.test/storage/v1/object/public/comunicados/v0.2/tela%20nova.png');
});
