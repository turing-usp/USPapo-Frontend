import { ApiError, SESSAO_EXPIRADA, ferramenta, lerFrames, streamChat, type ChatEvent } from '../lib/api';

const mockFetch = jest.fn();
jest.mock('expo/fetch', () => ({ fetch: (...args: unknown[]) => mockFetch(...args) }));

function resposta(status: number, partes: string[] | object, headers: Record<string, string> = {}) {
  const bytes = Array.isArray(partes) ? partes.map((p) => new TextEncoder().encode(p)) : [];
  return {
    ok: status < 400, status,
    headers: { get: (k: string) => headers[k.toLowerCase()] ?? null },
    json: async () => partes,
    body: { getReader: () => ({ read: async () => (bytes.length ? { done: false, value: bytes.shift() } : { done: true }), releaseLock() {} }) },
  };
}

async function coletar(gen: AsyncGenerator<ChatEvent>) {
  const eventos: ChatEvent[] = [];
  for await (const e of gen) eventos.push(e);
  return eventos;
}

test('lerFrames keeps the partial tail and drops junk', () => {
  const [eventos, resto] = lerFrames(': ok\n\ndata: {"type":"text","delta":"a"}\n\ndata: {nope}\n\ndata: {"type":"x"}\n\ndata: {"type":"end"');
  expect(eventos).toEqual([{ type: 'text', delta: 'a' }]);
  expect(resto).toBe('data: {"type":"end"');
});

test('streams events and decodes accents split across chunks', async () => {
  const frame = 'data: {"type":"text","delta":"ação"}\n\ndata: {"type":"end"}\n\n';
  const bytes = new TextEncoder().encode(frame);
  const meio = frame.indexOf('ç') + 1; // split inside the two-byte "ç"
  mockFetch.mockResolvedValueOnce({
    ...resposta(200, []),
    body: { getReader: () => {
      const partes = [bytes.slice(0, meio), bytes.slice(meio)];
      return { read: async () => (partes.length ? { done: false, value: partes.shift() } : { done: true }), releaseLock() {} };
    } },
  });
  expect(await coletar(streamChat({ question: 'oi', token: 't' }))).toEqual([{ type: 'text', delta: 'ação' }, { type: 'end' }]);
  const [, init] = mockFetch.mock.calls[0];
  expect(JSON.parse(init.body)).toEqual({ pergunta: 'oi' });
  expect(init.headers.Authorization).toBe('Bearer t');
});

test('maps HTTP failures to ApiError with the backend wording', async () => {
  mockFetch.mockResolvedValueOnce(resposta(429, { erro: 'Calma!', retry_after: 30 }));
  await expect(coletar(streamChat({ question: 'oi', token: 't' }))).rejects.toMatchObject({ status: 429, retryAfter: 30, message: 'Calma!' });
  mockFetch.mockResolvedValueOnce(resposta(401, { erro: 'x' }));
  await expect(coletar(streamChat({ question: 'oi', token: 't' }))).rejects.toMatchObject({ status: 401, message: SESSAO_EXPIRADA });
  await expect(coletar(streamChat({ question: 'oi', token: '' }))).rejects.toBeInstanceOf(ApiError);
});

test('tool labels fall back to a generic pt-BR label', () => {
  expect(ferramenta('consultar_bandejao').rotulo).toBe('Consultando cardápio');
  expect(ferramenta('desconhecida').rotulo).toBe('Usando ferramenta');
});
