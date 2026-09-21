/**
 * lib/api tests: SSE parsing (multi-event buffer + incremental chunked feed)
 * and streamChat against a fake fetch (fake SSE ReadableStream body).
 * No network: fetch is mocked, every byte is scripted.
 */
import {
  ChatApiError,
  TOOL_LABELS,
  backendUrl,
  createSSEFeed,
  isChatEvent,
  labelDaFerramenta,
  parseSSEBlocks,
  streamChat,
  type ChatEvent,
} from '../../lib/api';
import { configurarFetch } from '../../lib/fetchStream';

declare const process: { env: Record<string, string | undefined> };

// ─────────────────────────────────────────────
// Fixtures
// ─────────────────────────────────────────────

/** The full event sequence the happy-path stream emits (8 event shapes). */
const WIRE =
  ': ok\n\n' +
  'data: {"type":"provedor","name":"groq","index":0}\n\n' +
  'data: {"type":"pensando","delta":"Deixa eu ver…"}\n\n' +
  'data: {"type":"tool","state":"start","index":0,"name":"consultar_circulares"}\n\n' +
  'data: {"type":"tool","state":"end","index":0,"name":"consultar_circulares","args":{"linha":"3750"},"results":3}\n\n' +
  'data: {"type":"text","delta":"O 3750 chega às "}\n\n' +
  'data: {"type":"text","delta":"14:30. Ção!"}\n\n' +
  'data: {"type":"sources","urls":["https://www.usp.br/a","https://www.usp.br/b"]}\n\n' +
  'data: {"type":"end"}\n\n';

const EVENTOS: ChatEvent[] = [
  { type: 'provedor', name: 'groq', index: 0 },
  { type: 'pensando', delta: 'Deixa eu ver…' },
  { type: 'tool', state: 'start', index: 0, name: 'consultar_circulares' },
  {
    type: 'tool',
    state: 'end',
    index: 0,
    name: 'consultar_circulares',
    args: { linha: '3750' },
    results: 3,
  },
  { type: 'text', delta: 'O 3750 chega às ' },
  { type: 'text', delta: '14:30. Ção!' },
  { type: 'sources', urls: ['https://www.usp.br/a', 'https://www.usp.br/b'] },
  { type: 'end' },
];

async function consumir(gen: AsyncGenerator<ChatEvent, void, unknown>): Promise<ChatEvent[]> {
  const eventos: ChatEvent[] = [];
  for await (const evento of gen) eventos.push(evento);
  return eventos;
}

function corpoSSE(bytes: Uint8Array[]): ReadableStream<Uint8Array> {
  return new ReadableStream<Uint8Array>({
    start(controller) {
      for (const chunk of bytes) controller.enqueue(chunk);
      controller.close();
    },
  });
}

function respostaSSE(bytes: Uint8Array[]): Response {
  return {
    ok: true,
    status: 200,
    headers: new Headers({ 'content-type': 'text/event-stream; charset=utf-8' }),
    body: corpoSSE(bytes),
    json: async () => {
      throw new Error('o corpo SSE não é JSON');
    },
  } as unknown as Response;
}

function respostaJSON(status: number, corpo: unknown, headers: Record<string, string> = {}): Response {
  return {
    ok: status >= 200 && status < 300,
    status,
    headers: new Headers({ 'content-type': 'application/json', ...headers }),
    json: async () => corpo,
  } as unknown as Response;
}

// The fake fetch is installed per test so each one scripts its own body.
function instalarFetch(): jest.Mock<Promise<Response>, [string, RequestInit]> {
  const fetchMock = jest.fn<Promise<Response>, [string, RequestInit]>();
  (globalThis as unknown as { fetch: typeof fetch }).fetch =
    fetchMock as unknown as typeof fetch;
  // streamChat goes through the lib/fetchStream seam (expo/fetch on native,
  // the platform fetch on web), so the fake has to be installed there too.
  configurarFetch(fetchMock as unknown as typeof fetch);
  return fetchMock;
}

afterEach(() => configurarFetch(null));

// ─────────────────────────────────────────────
// parseSSEBlocks
// ─────────────────────────────────────────────

describe('parseSSEBlocks', () => {
  it('parses a multi-event buffer: all 8 event shapes, comments ignored', () => {
    const wire =
      ': ok\n\n' +
      'data: {"type":"provedor","name":"openai","index":1}\n\n' +
      'data: {"type":"pensando","delta":"raciocinando"}\n\n' +
      'data: {"type":"tool","state":"start","index":-1,"name":"consultar_sala"}\n\n' +
      'data: {"type":"tool","state":"end","index":-1,"name":"consultar_sala","args":{},"results":1}\n\n' +
      'data: {"type":"text","delta":"oi"}\n\n' +
      'data: {"type":"sources","urls":["https://usp.br/x"]}\n\n' +
      'data: {"type":"error","message":"A resposta parou no meio do caminho."}\n\n' +
      'data: {"type":"end"}\n\n';

    expect(parseSSEBlocks(wire)).toEqual([
      { type: 'provedor', name: 'openai', index: 1 },
      { type: 'pensando', delta: 'raciocinando' },
      { type: 'tool', state: 'start', index: -1, name: 'consultar_sala' },
      { type: 'tool', state: 'end', index: -1, name: 'consultar_sala', args: {}, results: 1 },
      { type: 'text', delta: 'oi' },
      { type: 'sources', urls: ['https://usp.br/x'] },
      { type: 'error', message: 'A resposta parou no meio do caminho.' },
      { type: 'end' },
    ]);
  });

  it('parses the full happy-path wire byte-for-byte', () => {
    expect(parseSSEBlocks(WIRE)).toEqual(EVENTOS);
  });

  it('ignores comment-only frames (`: ok` ping, heartbeats)', () => {
    expect(parseSSEBlocks(': ok\n\n: heartbeat\n\n')).toEqual([]);
  });

  it('keeps only data: lines when other fields share a frame', () => {
    const wire = 'event: x\nid: 7\nretry: 3\ndata: {"type":"end"}\n\n';
    expect(parseSSEBlocks(wire)).toEqual([{ type: 'end' }]);
  });

  it('accepts CRLF line endings', () => {
    expect(parseSSEBlocks('data: {"type":"end"}\r\n\r\n')).toEqual([{ type: 'end' }]);
  });

  it('drops malformed JSON and unknown/invalid events without crashing', () => {
    const wire =
      'data: {isso não é json}\n\n' +
      'data: {"type":"xpto","delta":"nada"}\n\n' +
      'data: {"type":"tool","state":"meio","index":0,"name":"jupiter"}\n\n' +
      'data: {"type":"text","delta":"sobreviveu"}\n\n';
    expect(parseSSEBlocks(wire)).toEqual([{ type: 'text', delta: 'sobreviveu' }]);
  });

  it('leaves an incomplete trailing frame unparsed (the caller re-feeds it)', () => {
    expect(parseSSEBlocks('data: {"type":"text","delta":"par')).toEqual([]);
    expect(parseSSEBlocks('')).toEqual([]);
  });
});

// ─────────────────────────────────────────────
// createSSEFeed (incremental, split-in-the-middle chunks)
// ─────────────────────────────────────────────

describe('createSSEFeed', () => {
  it('replays the whole stream fed in 7-byte chunks (splits mid-frame)', () => {
    const feed = createSSEFeed();
    const eventos: ChatEvent[] = [];
    for (let i = 0; i < WIRE.length; i += 7) {
      eventos.push(...feed.push(WIRE.slice(i, i + 7)));
    }
    eventos.push(...feed.flush());
    expect(eventos).toEqual(EVENTOS);
  });

  it('replays the stream fed one character at a time', () => {
    const feed = createSSEFeed();
    const eventos: ChatEvent[] = [];
    for (const caractere of Array.from(WIRE)) eventos.push(...feed.push(caractere));
    eventos.push(...feed.flush());
    expect(eventos).toEqual(EVENTOS);
  });

  it('flush parses a final frame that lacks the terminating blank line', () => {
    const feed = createSSEFeed();
    expect(feed.push('data: {"type":"end"}')).toEqual([]);
    expect(feed.flush()).toEqual([{ type: 'end' }]);
  });

  it('handles CRLF frames across chunk boundaries', () => {
    const feed = createSSEFeed();
    const wire = 'data: {"type":"text","delta":"oi"}\r\n\r\ndata: {"type":"end"}\r\n\r\n';
    const eventos = [...feed.push(wire.slice(0, 10)), ...feed.push(wire.slice(10))];
    eventos.push(...feed.flush());
    expect(eventos).toEqual([
      { type: 'text', delta: 'oi' },
      { type: 'end' },
    ]);
  });
});

// ─────────────────────────────────────────────
// isChatEvent / TOOL_LABELS / backendUrl
// ─────────────────────────────────────────────

describe('isChatEvent', () => {
  it('accepts every documented shape', () => {
    for (const evento of EVENTOS) expect(isChatEvent(evento)).toBe(true);
    expect(isChatEvent({ type: 'end' })).toBe(true);
  });

  it('rejects non-events', () => {
    expect(isChatEvent('texto')).toBe(false);
    expect(isChatEvent(null)).toBe(false);
    expect(isChatEvent({ type: 'texto', delta: 'x' })).toBe(false);
    expect(isChatEvent({ type: 'tool', state: 'meio', index: 0, name: 'x' })).toBe(false);
    expect(isChatEvent({ type: 'sources', urls: ['ok', 7] })).toBe(false);
    expect(isChatEvent({ type: 'provedor', name: 'x' })).toBe(false);
  });
});

describe('TOOL_LABELS', () => {
  it('carries one pt-BR label per registered tool, the old site\'s wording', () => {
    // The nine names are the backend's registry (app/tools/real.py
    // EXPECTED_TOOLS); the strings are site/components/StatusBlock.tsx.
    expect(TOOL_LABELS).toEqual({
      buscar_documentos: 'Pesquisando nos documentos',
      consultar_bandejao: 'Consultando cardápio',
      consultar_grade_curricular: 'Consultando grade curricular',
      consultar_turmas: 'Consultando turmas',
      buscar_disciplina: 'Buscando disciplina',
      consultar_avaliacoes_professor: 'Buscando avaliações do professor',
      consultar_sala: 'Procurando a sala',
      consultar_circulares: 'Consultando a SPTrans',
      consultar_wikipedia: 'Consultando a Wikipédia',
    });
    expect(Object.keys(TOOL_LABELS)).toHaveLength(9);
  });

  it('an unknown tool gets the generic label, never its function name', () => {
    expect(labelDaFerramenta('consultar_circulares')).toBe('Consultando a SPTrans');
    expect(labelDaFerramenta('ferramenta_nova')).toBe('Usando ferramenta');
  });
});

describe('backendUrl', () => {
  const anterior = process.env.EXPO_PUBLIC_BACKEND_URL;

  afterEach(() => {
    if (anterior === undefined) delete process.env.EXPO_PUBLIC_BACKEND_URL;
    else process.env.EXPO_PUBLIC_BACKEND_URL = anterior;
  });

  it('defaults to the local dev backend', () => {
    delete process.env.EXPO_PUBLIC_BACKEND_URL;
    expect(backendUrl()).toBe('http://127.0.0.1:8000');
  });

  it('honors EXPO_PUBLIC_BACKEND_URL and strips the trailing slash', () => {
    process.env.EXPO_PUBLIC_BACKEND_URL = 'https://uspapo.example.com/';
    expect(backendUrl()).toBe('https://uspapo.example.com');
  });

  it('treats an empty env value as unset', () => {
    process.env.EXPO_PUBLIC_BACKEND_URL = '  ';
    expect(backendUrl()).toBe('http://127.0.0.1:8000');
  });
});

// ─────────────────────────────────────────────
// streamChat
// ─────────────────────────────────────────────

describe('streamChat', () => {
  it('POSTs the contract body and yields the events in wire order', async () => {
    const fetchMock = instalarFetch();
    const bytes = new TextEncoder().encode(WIRE);
    // Three TCP-style chunks, the first boundary landing mid-frame.
    const corte1 = Math.floor(bytes.length / 3);
    const corte2 = Math.floor((bytes.length * 2) / 3);
    fetchMock.mockResolvedValue(
      respostaSSE([bytes.slice(0, corte1), bytes.slice(corte1, corte2), bytes.slice(corte2)]),
    );

    const controller = new AbortController();
    const eventos = await consumir(
      streamChat({
        question: 'Quantas vagas tem o curso?',
        history: [{ pergunta: 'p1', resposta: 'r1' }],
        sessionId: 'conv-1',
        token: 'tok-123',
        signal: controller.signal,
      }),
    );

    expect(eventos).toEqual(EVENTOS); // order preserved: provedor → … → end

    expect(fetchMock).toHaveBeenCalledTimes(1);
    const [url, init] = fetchMock.mock.calls[0];
    expect(url).toBe('http://127.0.0.1:8000/api/chat');
    expect(init.method).toBe('POST');
    expect(init.headers).toEqual({
      'Content-Type': 'application/json',
      Authorization: 'Bearer tok-123',
    });
    expect(JSON.parse(String(init.body))).toEqual({
      pergunta: 'Quantas vagas tem o curso?',
      stream: true,
      historico: [{ pergunta: 'p1', resposta: 'r1' }],
      session_id: 'conv-1',
    });
    expect(init.signal).toBe(controller.signal);
  });

  it('survives a multi-byte UTF-8 character split across two chunks', async () => {
    const fetchMock = instalarFetch();
    const bytes = new TextEncoder().encode(WIRE);
    // The wire contains 'Ç' (0xC3 0x87): split the stream between the two
    // bytes of that character. A per-chunk TextDecoder would emit U+FFFD;
    // streamChat decodes with one streaming decoder.
    const alvo = new TextEncoder().encode('Ç');
    let offset = -1;
    for (let i = 0; i + 1 < bytes.length; i++) {
      if (bytes[i] === alvo[0] && bytes[i + 1] === alvo[1]) {
        offset = i;
        break;
      }
    }
    expect(offset).toBeGreaterThan(0);
    fetchMock.mockResolvedValue(
      respostaSSE([bytes.slice(0, offset + 1), bytes.slice(offset + 1)]),
    );

    const eventos = await consumir(streamChat({ question: 'oi', token: 'tok' }));
    expect(eventos).toEqual(EVENTOS);
  });

  it('omits historico/session_id when they are absent or empty', async () => {
    const fetchMock = instalarFetch();
    fetchMock.mockResolvedValue(respostaSSE([new TextEncoder().encode(WIRE)]));

    await consumir(streamChat({ question: 'oi', token: 'tok' }));
    const [url, init] = fetchMock.mock.calls[0];
    expect(url).toBe('http://127.0.0.1:8000/api/chat');
    expect(JSON.parse(String(init.body))).toEqual({ pergunta: 'oi', stream: true });
  });

  it('throws ChatApiError with status + retryAfter on 429', async () => {
    const fetchMock = instalarFetch();
    fetchMock.mockResolvedValue(
      respostaJSON(429, { erro: 'Muitas pessoas perguntando agora.', retry_after: 30 }),
    );

    const erro = await consumir(
      streamChat({ question: 'oi', token: 'tok' }),
    ).catch((e) => e);
    expect(erro).toBeInstanceOf(ChatApiError);
    expect(erro).toBeInstanceOf(Error);
    const chatErro = erro as ChatApiError;
    expect(chatErro.status).toBe(429);
    expect(chatErro.retryAfter).toBe(30);
    expect(chatErro.message).toBe('Muitas pessoas perguntando agora.');
  });

  it('reads retryAfter from the retry-after header when the body omits it', async () => {
    const fetchMock = instalarFetch();
    fetchMock.mockResolvedValue(
      respostaJSON(429, { erro: 'Calma lá.' }, { 'retry-after': '15' }),
    );
    const erro = await consumir(streamChat({ question: 'oi', token: 'tok' })).catch((e) => e);
    const chatErro = erro as ChatApiError;
    expect(chatErro.status).toBe(429);
    expect(chatErro.retryAfter).toBe(15);
  });

  it('maps 401 to the exact session-expiry message (mapAuthError passthrough)', async () => {
    const fetchMock = instalarFetch();
    fetchMock.mockResolvedValue(
      respostaJSON(401, { erro: 'Entre com sua conta para conversar com o USPapo.' }),
    );
    const erro = await consumir(streamChat({ question: 'oi', token: 'vencido' })).catch((e) => e);
    expect(erro).toBeInstanceOf(ChatApiError);
    expect((erro as ChatApiError).status).toBe(401);
    expect((erro as Error).message).toBe('Sua sessão expirou');
  });

  it('falls back to the generic pt-BR message when the error body is not JSON', async () => {
    const fetchMock = instalarFetch();
    fetchMock.mockResolvedValue(
      {
        ok: false,
        status: 500,
        headers: new Headers({ 'content-type': 'text/html' }),
        json: async () => {
          throw new Error('html, não json');
        },
      } as unknown as Response,
    );
    const erro = await consumir(streamChat({ question: 'oi', token: 'tok' })).catch((e) => e);
    expect((erro as ChatApiError).status).toBe(500);
    expect((erro as ChatApiError).retryAfter).toBeNull();
    expect((erro as Error).message).toBe(
      'Não consegui falar com o USPapo agora. Tente de novo em instantes.',
    );
  });

  it('fast-fails with "Sua sessão expirou" when there is no token (no fetch call)', async () => {
    const fetchMock = instalarFetch();
    await expect(consumir(streamChat({ question: 'oi', token: '' }))).rejects.toThrow(
      'Sua sessão expirou',
    );
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it('propagates network failures as-is (mapAuthError routes them)', async () => {
    const fetchMock = instalarFetch();
    const falha = new TypeError('Failed to fetch');
    fetchMock.mockRejectedValue(falha);
    await expect(consumir(streamChat({ question: 'oi', token: 'tok' }))).rejects.toBe(falha);
  });

  it('aborts in-flight reads when the signal fires (Stop button)', async () => {
    const fetchMock = instalarFetch();
    const controller = new AbortController();
    // A reader that serves one comment byte and then dies with AbortError
    // (what an aborted fetch body looks like).
    const leituraAbortada = Object.assign(new Error('aborted'), { name: 'AbortError' });
    const leitor: { read: jest.Mock; releaseLock?: () => void } = {
      read: jest
        .fn()
        .mockReturnValueOnce(Promise.resolve({ done: false, value: new Uint8Array([58]) })) // ':'
        .mockRejectedValueOnce(leituraAbortada),
    };
    fetchMock.mockResolvedValue({
      ok: true,
      status: 200,
      headers: new Headers({ 'content-type': 'text/event-stream' }),
      body: { getReader: () => leitor },
      json: async () => {
        throw new Error('sem json');
      },
    } as unknown as Response);

    const gen = streamChat({ question: 'oi', token: 'tok', signal: controller.signal });
    const promessa = consumir(gen);
    controller.abort();
    await expect(promessa).rejects.toBe(leituraAbortada);
    expect(leitor.read).toHaveBeenCalledTimes(2);
  });

  it('falls back to the legacy JSON mode when the body is not SSE', async () => {
    const fetchMock = instalarFetch();
    fetchMock.mockResolvedValue(
      respostaJSON(200, { resposta: 'Oi! Tudo bem?', fontes: ['https://usp.br/z'] }),
    );
    const eventos = await consumir(streamChat({ question: 'oi', token: 'tok' }));
    expect(eventos).toEqual([
      { type: 'text', delta: 'Oi! Tudo bem?' },
      { type: 'sources', urls: ['https://usp.br/z'] },
      { type: 'end' },
    ]);
  });
});
