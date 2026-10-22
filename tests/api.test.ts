import { Platform } from 'react-native';

import { ApiError, SESSAO_EXPIRADA, backendUrl, lerFrames, streamChat, type ChatEvent } from '../lib/api';

const mockFetch = jest.fn();
jest.mock('expo/fetch', () => ({ fetch: (...args: unknown[]) => mockFetch(...args) }));

test('web uses its own /api in development; native keeps the configured backend', () => {
  const descriptor = Object.getOwnPropertyDescriptor(Platform, 'OS')!;
  const previous = process.env.EXPO_PUBLIC_BACKEND_URL;
  try {
    process.env.EXPO_PUBLIC_BACKEND_URL = 'https://backend.example/';
    Object.defineProperty(Platform, 'OS', { configurable: true, value: 'web' });
    expect(backendUrl()).toBe('');
    Object.defineProperty(Platform, 'OS', { configurable: true, value: 'android' });
    expect(backendUrl()).toBe('https://backend.example');
  } finally {
    Object.defineProperty(Platform, 'OS', descriptor);
    if (previous === undefined) delete process.env.EXPO_PUBLIC_BACKEND_URL;
    else process.env.EXPO_PUBLIC_BACKEND_URL = previous;
  }
});

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

test('temporary requests use a dedicated endpoint and omit persistence identifiers', async () => {
  mockFetch.mockResolvedValueOnce(resposta(200, ['data: {"type":"end"}\n\n']));
  await coletar(streamChat({ question: 'segredo', token: 't', temporario: true, sessionId: 'ignored',
    turno: { conversaId: 'ignored', ordem: 2 }, history: [{ pergunta: 'antes', resposta: 'contexto' }] }));
  const [url, init] = mockFetch.mock.calls.at(-1);
  expect(url).toMatch(/\/api\/chat\/temporario$/);
  expect(JSON.parse(init.body)).toEqual({ pergunta: 'segredo', historico: [{ pergunta: 'antes', resposta: 'contexto' }] });
});

test('an older backend never silently turns a temporary chat into a saved chat', async () => {
  const before = mockFetch.mock.calls.length;
  mockFetch.mockResolvedValueOnce(resposta(404, {}));
  await expect(coletar(streamChat({ question: 'segredo', token: 't', temporario: true })))
    .rejects.toMatchObject({ status: 404, message: 'O backend deste ambiente ainda não oferece chat temporário.' });
  expect(mockFetch.mock.calls.length).toBe(before + 1);
});

test('events the app does not use are dropped (an older backend still sends them)', () => {
  const [eventos] = lerFrames('data: {"type":"provedor","name":"g","index":0}\n\ndata: {"type":"pensando"}\n\n'
    + 'data: {"type":"tool","state":"start","index":0,"name":"pesquisar_web"}\n\ndata: {"type":"status","text":"Pesquisando a web"}\n\n');
  expect(eventos).toEqual([{ type: 'status', text: 'Pesquisando a web' }]);
});
