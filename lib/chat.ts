/**
 * The chat state machine and the `useChat` hook.
 *
 * One conversation = one `conversas` row with ordered turns. A turn is saved
 * pending before the stream and completed only on a successful end; a stream
 * that dies leaves it pending and the next open re-sends it. `pensando` carries
 * no reasoning text: it only drives the "Pensando…" indicator.
 */
import { useCallback, useEffect, useRef, useState } from 'react';
import { Platform } from 'react-native';

import { ApiError, SESSAO_EXPIRADA, streamChat, type ChatEvent } from './api';
import { mapAuthError, sessaoAtual } from './auth';
import { conversaEmCache, guardarConversa } from './cache';
import { anexarMensagem, lerConversa, type Conversa, type Mensagem } from './conversations';
import { haptics } from './device';

export type Linha =
  | { id: string; autor: 'user'; texto: string }
  | { id: string; autor: 'assistant'; texto: string; fontes: string[]; completo: boolean; ordem: number }
  | { id: string; autor: 'ferramenta'; indice: number; nome: string; pronta: boolean; resultados: number }
  | { id: string; autor: 'erro'; mensagem: string; tipo: TipoErro }
  | { id: string; autor: 'nota'; texto: string };
export type TipoErro = 'sessao' | 'limite' | 'rede' | 'outro';
export type Status = 'idle' | 'respondendo' | 'errou';
export type EstadoChat = { linhas: Linha[]; status: Status; pergunta: string; ordem: number; escrevendo: boolean };

const CONTEXTO_TURNOS = 6;
const NOTA_INTERROMPIDA = 'A resposta foi interrompida.';

export const estadoVazio = (): EstadoChat => ({ linhas: [], status: 'idle', pergunta: '', ordem: 0, escrevendo: false });

/** Saved turns as lines (a trailing pending turn is left out: it is about to be re-sent). */
export function linhasSalvas(mensagens: Mensagem[]): Linha[] {
  return mensagens.filter((m) => m.resposta !== null).flatMap((m): Linha[] => [
    { id: `user:${m.ordem}`, autor: 'user', texto: m.pergunta },
    { id: `assistant:${m.ordem}`, autor: 'assistant', texto: m.resposta ?? '', fontes: m.fontes, completo: true, ordem: m.ordem },
  ]);
}

export function iniciar(pergunta: string, ordem: number, anteriores: Linha[]): EstadoChat {
  return {
    linhas: [...anteriores, { id: `user:${ordem}`, autor: 'user', texto: pergunta }],
    status: 'respondendo', pergunta, ordem, escrevendo: false,
  };
}

function erroLinha(estado: EstadoChat, mensagem: string, tipo: TipoErro): EstadoChat {
  return {
    ...estado, status: 'errou', escrevendo: false,
    linhas: [...estado.linhas, { id: `erro:${estado.linhas.length}`, autor: 'erro', mensagem, tipo }],
  };
}

/** Pure reducer: one stream event -> next state. Late events after an error are ignored. */
export function reduzir(estado: EstadoChat, ev: ChatEvent): EstadoChat {
  if (estado.status === 'errou') return estado;
  const linhas = estado.linhas;
  const ultima = linhas[linhas.length - 1];
  const respostaAberta = ultima?.autor === 'assistant' && !ultima.completo ? ultima : null;
  switch (ev.type) {
    case 'tool':
      if (ev.state === 'start') {
        return { ...estado, escrevendo: false, linhas: [...linhas, {
          id: `ferramenta:${estado.ordem}:${ev.index}:${linhas.length}`, autor: 'ferramenta', indice: ev.index, nome: ev.name,
          pronta: false, resultados: 0,
        }] };
      }
      return { ...estado, linhas: linhas.map((l) => l.autor === 'ferramenta' && !l.pronta && l.indice === ev.index
        ? { ...l, pronta: true, resultados: ev.results ?? 0 } : l) };
    case 'text':
      return { ...estado, escrevendo: true, linhas: respostaAberta
        ? [...linhas.slice(0, -1), { ...respostaAberta, texto: respostaAberta.texto + ev.delta }]
        : [...linhas, { id: `assistant:${estado.ordem}`, autor: 'assistant', texto: ev.delta, fontes: [], completo: false, ordem: estado.ordem }] };
    case 'pensando':
      return { ...estado, escrevendo: false };
    case 'sources':
      return respostaAberta ? { ...estado, linhas: [...linhas.slice(0, -1), { ...respostaAberta, fontes: ev.urls }] } : estado;
    case 'error':
      return erroLinha(estado, ev.message, 'outro');
    case 'end':
      return { ...estado, status: 'idle', escrevendo: false,
        linhas: respostaAberta ? [...linhas.slice(0, -1), { ...respostaAberta, completo: true }] : linhas };
    default:
      return estado;
  }
}

/** A thrown failure as a chat error (the Stop button is not an error). */
export function traduzirFalha(err: unknown): { mensagem: string; tipo: TipoErro } {
  if (err instanceof ApiError) {
    if (err.status === 401) return { mensagem: SESSAO_EXPIRADA, tipo: 'sessao' };
    if (err.status === 429) return { mensagem: err.message, tipo: 'limite' };
    return { mensagem: err.message, tipo: 'outro' };
  }
  if (err instanceof TypeError) return { mensagem: 'Sem conexão. Verifique sua internet e tente de novo.', tipo: 'rede' };
  return { mensagem: mapAuthError(err), tipo: 'outro' };
}

// ── first-question handoff (home -> chat, before any database write) ──
const pendentes = new Map<string, string>();
const CHAVE = 'uspapo:pendente:';

export function guardarPendente(id: string, pergunta: string): void {
  pendentes.set(id, pergunta);
  if (Platform.OS === 'web') {
    try { sessionStorage.setItem(CHAVE + id, pergunta); } catch { /* storage blocked: memory is enough */ }
  }
}

function tomarPendente(id: string): string | null {
  let pergunta = pendentes.get(id) ?? null;
  if (!pergunta && Platform.OS === 'web') {
    try { pergunta = sessionStorage.getItem(CHAVE + id); } catch { pergunta = null; }
  }
  return pergunta;
}

function esquecerPendente(id: string): void {
  pendentes.delete(id);
  if (Platform.OS === 'web') {
    try { sessionStorage.removeItem(CHAVE + id); } catch { /* ignore */ }
  }
}

export function novoId(): string {
  const c = globalThis.crypto as { randomUUID?: () => string } | undefined;
  return c?.randomUUID?.() ?? 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, (ch) => {
    const r = (Math.random() * 16) | 0;
    return (ch === 'x' ? r : (r & 0x3) | 0x8).toString(16);
  });
}

// ── the hook ──
export function useChat(id: string, opts: { aoSessaoExpirada: () => void; pertoDoFim?: () => boolean }) {
  const [estado, setEstado] = useState<EstadoChat>(() => {
    const pergunta = tomarPendente(id);
    return pergunta ? iniciar(pergunta, 0, []) : estadoVazio();
  });
  const [carregou, setCarregou] = useState(false);
  const [userId, setUserId] = useState<string | null>(null);
  const conversa = useRef<Conversa | null>(null);
  const controle = useRef<AbortController | null>(null);
  const optsRef = useRef(opts);
  optsRef.current = opts;

  const responder = useCallback(async (pergunta: string, ordem: number, uid: string) => {
    controle.current?.abort();
    const ctrl = new AbortController();
    controle.current = ctrl;
    const salvas = (conversa.current?.mensagens ?? []).filter((m) => m.resposta !== null && m.ordem < ordem);
    let local = iniciar(pergunta, ordem, linhasSalvas(salvas));
    setEstado(local);
    const { token } = await sessaoAtual();
    try {
      for await (const ev of streamChat({
        question: pergunta, sessionId: id, token, signal: ctrl.signal,
        history: salvas.slice(-CONTEXTO_TURNOS).map((m) => ({ pergunta: m.pergunta, resposta: m.resposta as string })),
      })) {
        local = reduzir(local, ev);
        setEstado(local);
      }
    } catch (err) {
      if (ctrl.signal.aborted) {
        const parcial = local.linhas.some((l) => l.autor === 'assistant' && !l.completo);
        setEstado({ ...local, status: 'idle', escrevendo: false,
          linhas: parcial ? [...local.linhas, { id: `nota:${local.linhas.length}`, autor: 'nota', texto: NOTA_INTERROMPIDA }] : local.linhas });
        return;
      }
      const falha = traduzirFalha(err);
      void haptics.error();
      setEstado(erroLinha(local, falha.mensagem, falha.tipo));
      if (falha.tipo === 'sessao') optsRef.current.aoSessaoExpirada();
      return;
    } finally {
      if (controle.current === ctrl) controle.current = null;
    }
    const resposta = local.linhas.find((l): l is Extract<Linha, { autor: 'assistant' }> => l.autor === 'assistant' && l.ordem === ordem);
    if (local.status !== 'idle' || !resposta?.texto.trim()) {
      if (local.status !== 'errou') setEstado(erroLinha(local, 'A resposta chegou vazia. Tente de novo.', 'outro'));
      return;
    }
    try {
      await anexarMensagem(uid, id, { ordem, pergunta, resposta: resposta.texto, fontes: resposta.fontes });
    } catch {
      // the answer is on screen; the turn stays pending and is re-sent on the next open
    }
    const mensagens = [...salvas, { ordem, pergunta, resposta: resposta.texto, fontes: resposta.fontes }];
    const agora = new Date().toISOString();
    conversa.current = {
      ...(conversa.current ?? { id, titulo: pergunta, criada_em: agora, favorita: false }),
      mensagens, pergunta: mensagens[0].pergunta, resposta: resposta.texto, atualizada_em: agora,
    } as Conversa;
    void guardarConversa(uid, conversa.current);
    if (optsRef.current.pertoDoFim && !optsRef.current.pertoDoFim()) void haptics.finished();
  }, [id]);

  /** Saves the pending turn (idempotent; offline it is retried with the question) and streams it. */
  const enviarTurno = useCallback(async (pergunta: string, ordem: number, uid: string) => {
    await anexarMensagem(uid, id, { ordem, pergunta }).catch((err) => console.warn('[chat] turno pendente:', err));
    await responder(pergunta, ordem, uid);
  }, [id, responder]);

  useEffect(() => {
    let ativo = true;
    void (async () => {
      const { userId: uid } = await sessaoAtual();
      if (!ativo) return;
      if (!uid) {
        optsRef.current.aoSessaoExpirada();
        return;
      }
      setUserId(uid);
      const linha = await lerConversa(uid, id).catch(() => null) ?? await conversaEmCache(uid, id);
      if (!ativo) return;
      conversa.current = linha;
      setCarregou(true);
      const salvas = linha?.mensagens ?? [];
      const pendente = salvas.find((m) => m.resposta === null);
      const nova = tomarPendente(id);
      esquecerPendente(id);
      if (pendente) void enviarTurno(pendente.pergunta, pendente.ordem, uid);
      else if (nova && !salvas.length) void enviarTurno(nova, 0, uid);
      else setEstado({ ...estadoVazio(), linhas: linhasSalvas(salvas), ordem: salvas.length });
    })();
    return () => {
      ativo = false;
      controle.current?.abort();
    };
  }, [id, enviarTurno]);

  const send = useCallback((texto: string) => {
    const pergunta = texto.trim();
    if (!pergunta || !userId) return;
    void haptics.send();
    const respondidas = (conversa.current?.mensagens ?? []).filter((m) => m.resposta !== null).length;
    const repetir = estado.status === 'errou' && estado.pergunta === pergunta;
    void enviarTurno(pergunta, repetir ? estado.ordem : respondidas, userId);
  }, [userId, estado.status, estado.pergunta, estado.ordem, enviarTurno]);

  const stop = useCallback(() => {
    void haptics.press();
    controle.current?.abort();
  }, []);

  return { ...estado, carregou, userId, send, stop };
}
