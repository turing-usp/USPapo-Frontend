/**
 * useChat contract tests (P8), against the REAL exported surface:
 * reduzirEvento (the pure SSE→state reducer), traduzirFalha (the error
 * model), duracaoEmPortugues (the 429 wait) and executarResposta (the
 * stream runner, driven here with a FAKE streamChat).
 *
 * lib/api, lib/conversations, lib/supabase and lib/haptics are mocked —
 * no network, every event is scripted. The screens stay out of the jest
 * gate (tsc only); this is the hook's data contract.
 */
import { ChatApiError, streamChat } from '../../lib/api';
import type { ChatEvent, ChatRequest } from '../../lib/api';
import { anexarMensagem } from '../../lib/conversations';
import {
  comNotaInterrompida,
  duracaoEmPortugues,
  estadoInicial,
  executarResposta,
  reduzirEvento,
  traduzirFalha,
  type EstadoChat,
} from '../../app/(main)/chat/useChat';

// ─────────────────────────────────────────────
// Mocks (hoisted)
// ─────────────────────────────────────────────

jest.mock('../../lib/api', () => {
  /** Structural clone of lib/api's ChatApiError, defined INSIDE the factory
   *  (jest forbids out-of-scope references): the SUT and the tests both
   *  receive this class, so `instanceof` stays consistent. */
  class ChatApiError extends Error {
    readonly status: number;
    readonly retryAfter: number | null;
    constructor(message: string, status: number, retryAfter: number | null) {
      super(message);
      this.name = 'ChatApiError';
      this.status = status;
      this.retryAfter = retryAfter;
    }
  }
  const ROTULOS: Record<string, string> = {
    consultar_circulares: 'Checando os horários',
    buscar_documentos: 'Consultando documentos da USP',
  };
  return {
    ChatApiError,
    streamChat: jest.fn(),
    TOOL_LABELS: ROTULOS,
    labelDaFerramenta: (name: string) => ROTULOS[name] ?? name,
  };
});

jest.mock('../../lib/conversations', () => ({
  anexarMensagem: jest.fn(async () => undefined),
  anexarTurno: jest.fn(async () => undefined),
  lerConversa: jest.fn(async () => null),
  lerHistorico: jest.fn(async () => []),
}));

jest.mock('../../lib/supabase', () => ({
  supabase: {
    auth: {
      getSession: jest.fn(async () => ({
        data: { session: { user: { id: 'u-1' }, access_token: 'tok-123' } },
      })),
    },
  },
}));

jest.mock('../../lib/haptics', () => ({
  haptics: {
    send: jest.fn(async () => undefined),
    like: jest.fn(async () => undefined),
    dislike: jest.fn(async () => undefined),
    error: jest.fn(async () => undefined),
    finished: jest.fn(async () => undefined),
    favorite: jest.fn(async () => undefined),
  },
}));

// The mocked runtime values, typed for the test side.
const streamChatFake = streamChat as unknown as jest.Mock<
  AsyncGenerator<ChatEvent, void, unknown>,
  [ChatRequest]
>;
const anexarFake = anexarMensagem as unknown as jest.Mock<void, unknown[]>;

/** The completion calls: `anexarMensagem` WITH a resposta in the turn. */
function chamadasDeConclusao(): unknown[][] {
  // (userId, id, {ordem, pergunta, resposta, fontes}) — the completion
  // call; the pending insert carries no `resposta`.
  return anexarFake.mock.calls.filter(
    (c) => (c[2] as { resposta?: string } | undefined)?.resposta !== undefined,
  );
}

beforeEach(() => {
  streamChatFake.mock.calls.length = 0;
  streamChatFake.mockImplementation(async function* () {
    return; // yield nothing by default
  });
  anexarFake.mock.calls.length = 0;
});

// ─────────────────────────────────────────────
// Fixtures
// ─────────────────────────────────────────────

/** The full happy-path event sequence (same shapes as the api test). */
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

const PERGUNTA = 'O 3750 chega às quantas horas?';
const TEXTO_COMPLETO = 'O 3750 chega às 14:30. Ção!';

function basico(over: Partial<{ signal: AbortSignal }> = {}) {
  return {
    userId: 'u-1',
    pergunta: PERGUNTA,
    historico: [{ pergunta: 'A pergunta anterior', resposta: 'A resposta anterior' }],
    sessionId: 'c-1',
    token: 'tok-123',
    signal: over.signal ?? new AbortController().signal,
  };
}

// ─────────────────────────────────────────────
// The full event sequence → the turns build correctly
// ─────────────────────────────────────────────

describe('executarResposta — full sequence', () => {
  it('folds tool lines, incremental text and sources into the state', async () => {
    streamChatFake.mockImplementation(async function* () {
      for (const evento of EVENTOS) yield evento;
    });
    const coletados: EstadoChat[] = [];
    const r = await executarResposta({
      ...basico(),
      aoEstado: (e) => coletados.push(e),
    });

    expect(r.ok).toBe(true);
    if (!r.ok) return;
    expect(r.estado.status).toBe('idle');
    expect(r.estado.concluido).toBe(true);
    expect(r.estado.erro).toBeNull();
    expect(r.texto).toBe(TEXTO_COMPLETO);
    expect(r.fontes).toEqual(['https://www.usp.br/a', 'https://www.usp.br/b']);

    const turnos = r.estado.turnos;
    expect(turnos[0].autor).toBe('user');
    if (turnos[0].autor !== 'user') return;
    expect(turnos[0].texto).toBe(PERGUNTA);

    // The tool line: label from TOOL_LABELS, done with the results count.
    const ferramenta = turnos.find((t) => t.autor === 'ferramenta');
    expect(ferramenta).toBeDefined();
    if (!ferramenta || ferramenta.autor !== 'ferramenta') return;
    expect(ferramenta.rotulo).toBe('Checando os horários');
    expect(ferramenta.indice).toBe(0);
    expect(ferramenta.pronta).toBe(true);
    expect(ferramenta.resultados).toBe(3);

    // The assistant turn: the full text, complete, with the sources.
    const assistente = turnos[turnos.length - 1];
    expect(assistente.autor).toBe('assistant');
    if (assistente.autor !== 'assistant') return;
    expect(assistente.texto).toBe(TEXTO_COMPLETO);
    expect(assistente.completo).toBe(true);
    expect(assistente.fontes).toEqual(['https://www.usp.br/a', 'https://www.usp.br/b']);

    // Incremental: an intermediate state already held the partial text.
    const parcial = coletados.find(
      (e) =>
        e.turnos.some(
          (t) => t.autor === 'assistant' && t.texto === 'O 3750 chega às ',
        ),
    );
    expect(parcial).toBeDefined();
  });

  it('sends the wire shape: question + {pergunta, resposta} pairs + session_id + token', async () => {
    streamChatFake.mockImplementation(async function* () {
      for (const evento of EVENTOS) yield evento;
    });
    const sinal = new AbortController().signal;
    await executarResposta({ ...basico(), signal: sinal });

    expect(streamChatFake.mock.calls.length).toBe(1);
    const req = streamChatFake.mock.calls[0][0];
    expect(req.question).toBe(PERGUNTA);
    expect(req.history).toEqual([
      { pergunta: 'A pergunta anterior', resposta: 'A resposta anterior' },
    ]);
    expect(req.sessionId).toBe('c-1');
    expect(req.token).toBe('tok-123');
    expect(req.signal).toBe(sinal);
  });

  it('persists the FULL text on the successful end (the P9 completion call)', async () => {
    streamChatFake.mockImplementation(async function* () {
      for (const evento of EVENTOS) yield evento;
    });
    const r = await executarResposta(basico());
    expect(r.ok).toBe(true);

    const conclusao = chamadasDeConclusao();
    expect(conclusao.length).toBe(1);
    expect(conclusao[0]).toEqual([
      'u-1',
      'c-1',
      {
        ordem: 0,
        pergunta: PERGUNTA,
        resposta: TEXTO_COMPLETO,
        fontes: ['https://www.usp.br/a', 'https://www.usp.br/b'],
      },
    ]);
  });
});

// ─────────────────────────────────────────────
// A mid-stream death leaves NO completion call
// ─────────────────────────────────────────────

describe('executarResposta — mid-stream death', () => {
  it('a thrown provider error: status errou, partial text kept, no completion', async () => {
    streamChatFake.mockImplementation(async function* () {
      yield { type: 'text', delta: 'Comecei a ' };
      yield { type: 'text', delta: 'responder…' };
      throw new Error('provider down');
    });
    const r = await executarResposta(basico());

    expect(r.ok).toBe(false);
    if (r.ok) return;
    expect(r.estado.status).toBe('errou');
    expect(r.erro.tipo).toBe('outro');
    const assistente = r.estado.turnos.find((t) => t.autor === 'assistant');
    expect(assistente).toBeDefined();
    if (assistente && assistente.autor === 'assistant') {
      expect(assistente.texto).toBe('Comecei a responder…');
      expect(assistente.completo).toBe(false);
    }
    // The pending row stays pending: no completion write.
    expect(chamadasDeConclusao().length).toBe(0);
  });

  it('an in-stream engine error (error + end): the backend message verbatim, no completion', async () => {
    const MSG = 'Ops! Muitas pessoas estão utilizando o USPapo. Tente novamente em breve.';
    streamChatFake.mockImplementation(async function* () {
      yield { type: 'text', delta: 'Só um instante…' };
      yield { type: 'error', message: MSG };
      yield { type: 'end' };
    });
    const r = await executarResposta(basico());

    expect(r.ok).toBe(false);
    if (r.ok) return;
    expect(r.estado.status).toBe('errou');
    expect(r.erro.mensagem).toBe(MSG);
    expect(chamadasDeConclusao().length).toBe(0);
    // The error line lands in the turns (the UI's "Tentar de novo" surface).
    expect(r.estado.turnos.some((t) => t.autor === 'erro')).toBe(true);
  });
});

// ─────────────────────────────────────────────
// 429 → the retry message + status 'errou'
// ─────────────────────────────────────────────

describe('executarResposta — 429', () => {
  it('converts retryAfter to the pt-BR duration and does not persist', async () => {
    streamChatFake.mockImplementation(async function* () {
      throw new ChatApiError('muitas pessoas agora', 429, 90);
    });
    const r = await executarResposta(basico());

    expect(r.ok).toBe(false);
    if (r.ok) return;
    expect(r.estado.status).toBe('errou');
    expect(r.erro.tipo).toBe('limite');
    expect(r.erro.mensagem).toBe('Tente novamente em 2 minutos');
    expect(chamadasDeConclusao().length).toBe(0);
  });
});

// ─────────────────────────────────────────────
// 401 → the session-expiry fast-fail (the login redirect)
// ─────────────────────────────────────────────

describe('executarResposta — 401', () => {
  it('a thrown ChatApiError 401: "Sua sessão expirou" + the redirect called', async () => {
    const redirect = jest.fn();
    streamChatFake.mockImplementation(async function* () {
      throw new ChatApiError('unauthorized', 401, null);
    });
    const r = await executarResposta({ ...basico(), aoSessaoExpirada: redirect });

    expect(r.ok).toBe(false);
    if (r.ok) return;
    expect(r.estado.status).toBe('errou');
    expect(r.erro.tipo).toBe('sessao');
    expect(r.erro.mensagem).toBe('Sua sessão expirou');
    expect(redirect.mock.calls.length).toBe(1);
  });

  it('the no-token fast-fail (Error("Sua sessão expirou")) also fast-fails', async () => {
    const redirect = jest.fn();
    streamChatFake.mockImplementation(async function* () {
      throw new Error('Sua sessão expirou');
    });
    const r = await executarResposta({ ...basico(), aoSessaoExpirada: redirect });

    expect(r.ok).toBe(false);
    if (r.ok) return;
    expect(r.erro.tipo).toBe('sessao');
    expect(r.erro.mensagem).toBe('Sua sessão expirou');
    expect(redirect.mock.calls.length).toBe(1);
  });
});

// ─────────────────────────────────────────────
// stop(): the fake stream observes the signal
// ─────────────────────────────────────────────

describe('executarResposta — stop (abort)', () => {
  it('aborts the in-flight stream and marks the result interrompido', async () => {
    const controller = new AbortController();
    let sinalVisto: AbortSignal | null = null;
    streamChatFake.mockImplementation(
      async function* (req: ChatRequest) {
        sinalVisto = req.signal ?? null;
        // Hang until the abort lands (or 100ms, as a safety net).
        if (sinalVisto) {
          const sinal = sinalVisto;
          await new Promise<void>((resolve, reject) => {
            const t = setTimeout(() => resolve(), 100);
            sinal.addEventListener('abort', () => {
              clearTimeout(t);
              reject(new Error('AbortError'));
            });
          });
        } else {
          await new Promise<void>((resolve) => setTimeout(resolve, 100));
        }
      },
    );
    const p = executarResposta({ ...basico(), signal: controller.signal });
    controller.abort();
    const r = await p;

    expect(sinalVisto).toBe(controller.signal);
    expect(r.ok).toBe(false);
    if (r.ok) return;
    expect(r.interrompido).toBe(true);
    // No error is persisted, no completion write.
    expect(chamadasDeConclusao().length).toBe(0);
  });
});

// ─────────────────────────────────────────────
// The pure reducer (no stream at all)
// ─────────────────────────────────────────────

describe('reduzirEvento', () => {
  it('the full sequence folds into the final state', () => {
    let estado = estadoInicial(PERGUNTA);
    for (const evento of EVENTOS) estado = reduzirEvento(estado, evento);
    expect(estado.status).toBe('idle');
    expect(estado.concluido).toBe(true);
    expect(estado.escrevendo).toBe(false);
    expect(Object.keys(estado.ferramentas).length).toBe(0);
    const ultimo = estado.turnos[estado.turnos.length - 1];
    expect(ultimo.autor).toBe('assistant');
    if (ultimo.autor !== 'assistant') return;
    expect(ultimo.texto).toBe(TEXTO_COMPLETO);
    expect(ultimo.completo).toBe(true);
  });

  it('a tool start adds the line (pronta=false) and the end marks it done', () => {
    let estado = estadoInicial(PERGUNTA);
    estado = reduzirEvento(estado, { type: 'tool', state: 'start', index: 5, name: 'ferramenta_x' });
    const rodando = estado.turnos.find((t) => t.autor === 'ferramenta');
    expect(rodando).toBeDefined();
    if (!rodando || rodando.autor !== 'ferramenta') return;
    expect(rodando.pronta).toBe(false);
    expect(rodando.rotulo).toBe('ferramenta_x'); // unknown tool: the raw name
    expect(Object.keys(estado.ferramentas).length).toBe(1);

    estado = reduzirEvento(estado, {
      type: 'tool',
      state: 'end',
      index: 5,
      name: 'ferramenta_x',
      results: 2,
    });
    const pronta = estado.turnos.find((t) => t.autor === 'ferramenta');
    if (!pronta || pronta.autor !== 'ferramenta') return;
    expect(pronta.pronta).toBe(true);
    expect(pronta.resultados).toBe(2);
    expect(Object.keys(estado.ferramentas).length).toBe(0);
  });

  it('the tool line keeps the raw tool NAME, so the pill can look up a description', () => {
    let estado = estadoInicial(PERGUNTA);
    estado = reduzirEvento(estado, {
      type: 'tool',
      state: 'start',
      index: 0,
      name: 'consultar_circulares',
    });
    const linha = estado.turnos.find((t) => t.autor === 'ferramenta');
    if (!linha || linha.autor !== 'ferramenta') throw new Error('sem linha');
    expect(linha.nome).toBe('consultar_circulares');
    expect(linha.rotulo).toBe('Checando os horários');
  });

  it('pensando becomes a reasoning line and consecutive deltas grow the SAME one', () => {
    let estado = estadoInicial(PERGUNTA);
    estado = reduzirEvento(estado, { type: 'pensando', delta: 'preciso do ' });
    estado = reduzirEvento(estado, { type: 'pensando', delta: 'horário' });
    const raciocinios = estado.turnos.filter((t) => t.autor === 'raciocinio');
    expect(raciocinios).toHaveLength(1);
    const linha = raciocinios[0];
    if (linha.autor !== 'raciocinio') throw new Error('tipo errado');
    expect(linha.texto).toBe('preciso do horário');
    expect(linha.pronta).toBe(false);
  });

  it('a tool call closes the reasoning line, and reasoning AFTER it opens a new one', () => {
    let estado = estadoInicial(PERGUNTA);
    estado = reduzirEvento(estado, { type: 'pensando', delta: 'antes' });
    estado = reduzirEvento(estado, {
      type: 'tool',
      state: 'start',
      index: 0,
      name: 'consultar_circulares',
    });
    estado = reduzirEvento(estado, {
      type: 'tool',
      state: 'end',
      index: 0,
      name: 'consultar_circulares',
      results: 1,
    });
    // This is the case the old footer card could never show: the model goes
    // back to thinking once the tool has answered.
    estado = reduzirEvento(estado, { type: 'pensando', delta: 'depois' });

    const raciocinios = estado.turnos.filter((t) => t.autor === 'raciocinio');
    expect(raciocinios).toHaveLength(2);
    const [primeiro, segundo] = raciocinios;
    if (primeiro.autor !== 'raciocinio' || segundo.autor !== 'raciocinio') {
      throw new Error('tipo errado');
    }
    expect(primeiro.texto).toBe('antes');
    expect(primeiro.pronta).toBe(true);
    expect(segundo.texto).toBe('depois');
    expect(segundo.pronta).toBe(false);
    // Order matters: the second reasoning line sits AFTER the tool line.
    const posicoes = estado.turnos.map((t) => t.autor);
    expect(posicoes).toEqual(['user', 'raciocinio', 'ferramenta', 'raciocinio']);
  });

  it('the first answer token and the end both close the reasoning line', () => {
    let estado = estadoInicial(PERGUNTA);
    estado = reduzirEvento(estado, { type: 'pensando', delta: 'pensando…' });
    estado = reduzirEvento(estado, { type: 'text', delta: 'O ' });
    const aberto = estado.turnos.some((t) => t.autor === 'raciocinio' && !t.pronta);
    expect(aberto).toBe(false);
    expect(estado.escrevendo).toBe(true);

    // And nothing is left pulsing once the stream ends.
    estado = reduzirEvento(estado, { type: 'pensando', delta: 'mais' });
    estado = reduzirEvento(estado, { type: 'end' });
    expect(estado.turnos.some((t) => t.autor === 'raciocinio' && !t.pronta)).toBe(false);
  });

  it('an error closes the reasoning line too (no pulse under a failure)', () => {
    let estado = estadoInicial(PERGUNTA);
    estado = reduzirEvento(estado, { type: 'pensando', delta: 'hmm' });
    estado = reduzirEvento(estado, { type: 'error', message: 'algo deu errado' });
    expect(estado.turnos.some((t) => t.autor === 'raciocinio' && !t.pronta)).toBe(false);
  });

  it('the error + end invariant: the state stays "errou"', () => {
    let estado = estadoInicial(PERGUNTA);
    estado = reduzirEvento(estado, { type: 'error', message: 'algo deu errado' });
    expect(estado.status).toBe('errou');
    expect(estado.erro).not.toBeNull();
    estado = reduzirEvento(estado, { type: 'end' });
    expect(estado.status).toBe('errou');
    expect(estado.concluido).toBe(false);
    // Late events after the error do not touch the state.
    const intocado = reduzirEvento(estado, { type: 'text', delta: 'depois do erro' });
    expect(intocado).toBe(estado);
  });
});

// ─────────────────────────────────────────────
// The 429 wait duration (pt-BR)
// ─────────────────────────────────────────────

describe('duracaoEmPortugues', () => {
  it('matches the backend _wait_readable rules', () => {
    expect(duracaoEmPortugues(1)).toBe('1 segundo');
    expect(duracaoEmPortugues(30)).toBe('30 segundos');
    expect(duracaoEmPortugues(90)).toBe('2 minutos');
    expect(duracaoEmPortugues(60)).toBe('1 minuto');
    expect(duracaoEmPortugues(3600)).toBe('1 hora');
    expect(duracaoEmPortugues(7200)).toBe('2 horas');
  });
});

// ─────────────────────────────────────────────
// The thrown-failure translation
// ─────────────────────────────────────────────

describe('traduzirFalha', () => {
  it('a network TypeError gets the connection message', () => {
    const e = traduzirFalha(new TypeError('fetch failed'), new AbortController().signal);
    expect(e.tipo).toBe('outro');
    expect(e.mensagem).toBe('Verifique sua conexão e tente de novo');
  });

  it('an aborted signal is a neutral note, not an error', () => {
    const c = new AbortController();
    c.abort();
    const e = traduzirFalha(new Error('AbortError'), c.signal);
    expect(e.tipo).toBe('outro');
    expect(e.mensagem).toBe('A resposta foi interrompida.');
  });

  it('a 429 without retryAfter falls back to the server message', () => {
    const e = traduzirFalha(new ChatApiError('muitas pessoas', 429, null), new AbortController().signal);
    expect(e.tipo).toBe('limite');
    expect(e.mensagem).toBe('muitas pessoas');
  });

  it('a non-4xx ChatApiError keeps the server message', () => {
    const e = traduzirFalha(new ChatApiError('pergunta vazia', 400, null), new AbortController().signal);
    expect(e.tipo).toBe('outro');
    expect(e.mensagem).toBe('pergunta vazia');
  });
});

// ─────────────────────────────────────────────
// The interruption note
// ─────────────────────────────────────────────

describe('comNotaInterrompida', () => {
  it('adds the note once, only when there is partial text', () => {
    const semTexto = estadoInicial(PERGUNTA).turnos;
    expect(comNotaInterrompida(semTexto)).toBe(semTexto);
    const parcial = reduzirEvento(estadoInicial(PERGUNTA), { type: 'text', delta: 'meio…' });
    const comNota = comNotaInterrompida(parcial.turnos);
    expect(comNota.length).toBe(parcial.turnos.length + 1);
    const ultima = comNota[comNota.length - 1];
    expect(ultima.autor).toBe('nota');
    // Idempotent.
    expect(comNotaInterrompida(comNota)).toBe(comNota);
  });
});
