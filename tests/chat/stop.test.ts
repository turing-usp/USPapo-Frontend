/**
 * The Stop button, on the answer people actually want to stop.
 *
 * `useChat` starts the FIRST answer of a conversation from its mount effect
 * (the question travels from the home screen through the `pendente` map, and
 * the stream begins before any user interaction). That effect made its own
 * AbortController and never published it, while `stop()` aborted
 * `controllerRef.current` — which was only ever set by `send()`. So Stop was
 * inert on every conversation opened from the home screen, and only worked
 * on a retry or a follow-up.
 *
 * The hook is rendered for real here (the rest of the chat tests drive the
 * pure functions), because the bug lived entirely in the wiring between the
 * effect and the ref.
 */
// React only allows act() when the environment says so, and the jest-expo
// preset this project uses does not set it (there is no setup file).
(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

import { act, renderHook, waitFor } from '@testing-library/react-native';

import { streamChat } from '../../lib/api';
import type { ChatEvent, ChatRequest } from '../../lib/api';

jest.mock('../../lib/api', () => ({
  ChatApiError: class extends Error {},
  streamChat: jest.fn(),
  TOOL_LABELS: {},
  labelDaFerramenta: (n: string) => n,
}));

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
        data: { session: { user: { id: 'u-1' }, access_token: 'tok' } },
      })),
    },
  },
}));

jest.mock('../../lib/haptics', () => ({
  haptics: {
    send: jest.fn(async () => undefined),
    error: jest.fn(async () => undefined),
    finished: jest.fn(async () => undefined),
    press: jest.fn(async () => undefined),
  },
}));

jest.mock('../../lib/net', () => ({
  filaPendente: jest.fn(async () => []),
  queue: { enqueue: jest.fn(async () => undefined) },
}));

jest.mock('../../lib/cache', () => ({
  conversaPorIdOffline: jest.fn(async () => null),
  salvarConversa: jest.fn(async () => undefined),
  salvarConversas: jest.fn(async () => undefined),
}));

import { useChat } from '../../app/(main)/chat/useChat';
import { guardarPendente } from '../../app/(main)/pendente';

const streamChatFake = streamChat as unknown as jest.Mock<
  AsyncGenerator<ChatEvent, void, unknown>,
  [ChatRequest]
>;

/**
 * A stream that emits one delta and then WAITS, so the test can press Stop
 * while it is genuinely in flight. It resolves when the signal aborts,
 * exactly as a real reader does.
 */
function streamQueTrava(): {
  abortado: () => boolean;
  gerar: (req: ChatRequest) => AsyncGenerator<ChatEvent, void, unknown>;
} {
  let viuAbort = false;
  async function* gerar(req: ChatRequest) {
    yield { type: 'text', delta: 'Estou pensando' } as ChatEvent;
    await new Promise<void>((resolve) => {
      if (req.signal?.aborted) {
        viuAbort = true;
        resolve();
        return;
      }
      req.signal?.addEventListener('abort', () => {
        viuAbort = true;
        resolve();
      });
    });
    const erro = new Error('aborted');
    erro.name = 'AbortError';
    throw erro;
  }
  return { abortado: () => viuAbort, gerar };
}

beforeEach(() => {
  streamChatFake.mock.calls.length = 0;
});

it('stop() aborts the answer the mount effect started', async () => {
  const id = 'c-mount';
  guardarPendente({ id, question: 'Cadê o bandejão?', enqueuedAt: Date.now() });
  const travado = streamQueTrava();
  streamChatFake.mockImplementation(travado.gerar);

  // `renderHook` is ASYNC in RNTL 14 (it awaits the first act pass).
  const { result } = await renderHook(() => useChat(id));

  // The stream is running: the first delta landed.
  await waitFor(() => {
    expect(result.current.status).toBe('respondendo');
    expect(
      result.current.turns.some(
        (t) => t.autor === 'assistant' && t.texto !== '',
      ),
    ).toBe(true);
  });

  await act(async () => {
    result.current.stop();
  });

  expect(travado.abortado()).toBe(true);
  await waitFor(() => expect(result.current.status).toBe('idle'));
});

it('the partial answer stays on screen, with the interruption note', async () => {
  const id = 'c-parcial';
  guardarPendente({ id, question: 'Qual o cardápio?', enqueuedAt: Date.now() });
  streamChatFake.mockImplementation(streamQueTrava().gerar);

  const { result } = await renderHook(() => useChat(id));
  await waitFor(() => expect(result.current.status).toBe('respondendo'));

  await act(async () => {
    result.current.stop();
  });

  await waitFor(() => {
    // What was written is kept — stopping is not undoing.
    expect(
      result.current.turns.some(
        (t) => t.autor === 'assistant' && t.texto === 'Estou pensando',
      ),
    ).toBe(true);
    expect(
      result.current.turns.some(
        (t) => t.autor === 'nota' && t.texto === 'A resposta foi interrompida.',
      ),
    ).toBe(true);
  });
});
