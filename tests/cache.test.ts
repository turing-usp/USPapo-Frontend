import { conversaEmCache, esquecerConversa, guardarConversa, historicoEmCache, limparCache, tamanhoDoCache } from '../lib/cache';
import type { Conversa } from '../lib/conversations';

const conversa = (id: string, quando: string): Conversa => ({
  id, titulo: id, mensagens: [], pergunta: id, resposta: 'r', criada_em: quando, atualizada_em: quando, favorita: false,
});

test('the cache keeps the newest conversations per user and can be cleared', async () => {
  await guardarConversa('u1', conversa('a', '2026-09-01'));
  await guardarConversa('u1', conversa('b', '2026-09-02'));
  await guardarConversa('u2', conversa('x', '2026-09-03'));
  expect((await historicoEmCache('u1')).map((c) => c.id)).toEqual(['b', 'a']);
  expect(await conversaEmCache('u1', 'a')).not.toBeNull();
  await esquecerConversa('u1', 'a');
  expect(await conversaEmCache('u1', 'a')).toBeNull();
  expect(await tamanhoDoCache()).toBeGreaterThan(0);
  await limparCache();
  expect(await tamanhoDoCache()).toBe(0);
  expect(await historicoEmCache('u2')).toEqual([]);
});
