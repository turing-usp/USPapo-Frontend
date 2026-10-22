import React from 'react';
import { act, create, type ReactTestRenderer } from 'react-test-renderer';
import { Platform } from 'react-native';
import { pararChat, streamChat } from '../lib/api';
import { guardarPendente, useChat } from '../lib/chat';
import * as cache from '../lib/cache';
import * as conversations from '../lib/conversations';
import * as notifications from '../lib/notificacoes';

jest.mock('../lib/supabase', () => ({ supabase: {} }));
jest.mock('../lib/auth', () => ({ sessaoAtual: async () => ({ userId: 'user', token: 'token' }), mapAuthError: String }));
jest.mock('../lib/api', () => ({ ...jest.requireActual('../lib/api'), streamChat: jest.fn(), pararChat: jest.fn(), retomarChat: jest.fn() }));
jest.mock('../lib/cache', () => ({ conversaEmCache: jest.fn(), guardarConversa: jest.fn() }));
jest.mock('../lib/conversations', () => ({ anexarMensagem: jest.fn(), lerConversa: jest.fn() }));
jest.mock('../lib/notificacoes', () => ({ aoPerguntar: jest.fn(), avisarRespostaPronta: jest.fn() }));
jest.mock('../lib/device', () => ({ haptics: { send: jest.fn(), press: jest.fn(), error: jest.fn() } }));

let chat: ReturnType<typeof useChat>;
function Harness({ id }: { id: string }) {
  chat = useChat(id, { aoSessaoExpirada: jest.fn() });
  return null;
}
const flush = async () => { await act(async () => { await new Promise(r => setTimeout(r, 0)); }); };

test('temporary chats keep context in RAM, never access persistence, and are discarded on leaving', async () => {
  jest.mocked(streamChat).mockImplementation(async function* () {
    yield { type: 'text', delta: 'Resposta temporária' }; yield { type: 'end' };
  });
  const descriptor = Object.getOwnPropertyDescriptor(Platform, 'OS')!;
  Object.defineProperty(Platform, 'OS', { configurable: true, value: 'web' });
  const setItem = jest.fn();
  Object.defineProperty(globalThis, 'sessionStorage', { configurable: true, value: { setItem, getItem: jest.fn(), removeItem: jest.fn() } });
  let renderer!: ReactTestRenderer;
  try {
    guardarPendente('temporario-test', 'pergunta confidencial');
    await act(async () => { renderer = create(<Harness id="temporario-test" />); });
    await flush();
    expect(chat.status).toBe('idle');
    expect(chat.linhas).toHaveLength(2);
    await act(async () => { chat.send('continuação'); });
    await flush();
    expect(jest.mocked(streamChat).mock.calls.at(-1)?.[0]).toMatchObject({ temporario: true,
      turno: undefined, history: [{ pergunta: 'pergunta confidencial', resposta: 'Resposta temporária' }] });
    expect(chat.linhas).toHaveLength(4);
    expect(setItem).not.toHaveBeenCalled();
    for (const fn of [conversations.lerConversa, conversations.anexarMensagem, cache.conversaEmCache,
      cache.guardarConversa, notifications.avisarRespostaPronta, notifications.aoPerguntar]) expect(fn).not.toHaveBeenCalled();
    await act(async () => chat.descartar());
    expect(chat.linhas).toEqual([]);
    await act(async () => renderer.unmount());
    await act(async () => { renderer = create(<Harness id="temporario-test" />); });
    await flush();
    expect(chat.linhas).toEqual([]);
  } finally {
    await act(async () => renderer?.unmount());
    Object.defineProperty(Platform, 'OS', descriptor);
    Reflect.deleteProperty(globalThis, 'sessionStorage');
  }
});

test('discarding an in-flight temporary reply aborts it without a job or late content returning', async () => {
  let signal: AbortSignal | undefined;
  jest.mocked(streamChat).mockImplementation(async function* (request) {
    signal = request.signal;
    yield { type: 'text', delta: 'Parcial' };
    await new Promise<void>((_, reject) => signal!.addEventListener('abort', () => reject(new Error('aborted')), { once: true }));
  });
  guardarPendente('temporario-stream', 'segredo');
  let renderer!: ReactTestRenderer;
  await act(async () => { renderer = create(<Harness id="temporario-stream" />); });
  await flush();
  expect(chat.status).toBe('respondendo');
  await act(async () => chat.descartar());
  await flush();
  expect(signal?.aborted).toBe(true);
  expect(chat.linhas).toEqual([]);
  expect(chat.status).toBe('idle');
  expect(pararChat).not.toHaveBeenCalled();
  expect(conversations.anexarMensagem).not.toHaveBeenCalled();
  await act(async () => renderer.unmount());
});
