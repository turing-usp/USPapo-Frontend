/**
 * The chat state machine and the `useChat` hook.
 *
 * One conversation = one `conversas` row with ordered turns. A turn is saved
 * pending before the stream (the question shows at once); the server keeps
 * answering it when the app closes and saves the answer (so does the app on a
 * successful end, whichever is first). Opening a conversation with a pending
 * turn reattaches to the server's answer, and only re-sends it when there is
 * none. "Parar" stops it on the server, which saves the partial answer (pressed
 * before the stream began, the app saves the turn as interrupted). Of the tools the app only keeps the
 * server's status for the last one used, shown beside the thinking mark.
 */
import { useCallback, useEffect, useRef, useState } from 'react';
import { Platform } from 'react-native';

import { ApiError, SESSAO_EXPIRADA, pararChat, retomarChat, streamChat, type ChatEvent, type Turno } from './api';
import { mapAuthError, sessaoAtual } from './auth';
import { conversaEmCache, guardarConversa } from './cache';
import { anexarMensagem, lerConversa, type Conversa, type Mensagem } from './conversations';
import { haptics } from './device';
import { aoPerguntar, avisarRespostaPronta } from './notificacoes';

export type Linha =
  | { id: string; autor: 'user'; texto: string }
  | { id: string; autor: 'assistant'; texto: string; fontes: string[]; completo: boolean; ordem: number }
  | { id: string; autor: 'erro'; mensagem: string; tipo: TipoErro }
  | { id: string; autor: 'nota'; texto: string };
export type TipoErro = 'sessao' | 'limite' | 'rede' | 'outro';
export type Status = 'idle' | 'respondendo' | 'errou';
/** `etapa`: the status of the last tool this turn used (null until one runs). */
export type EstadoChat = { linhas: Linha[]; status: Status; pergunta: string; ordem: number; etapa: string | null };

const CONTEXTO_TURNOS = 6;
const NOTA_INTERROMPIDA = 'A resposta foi interrompida.';
/** How the server stores a stopped answer (USPapo-Backend/app/jobs.py). */
const MARCA_INTERROMPIDA = '*Resposta interrompida.*';

export const estadoVazio = (): EstadoChat => ({ linhas: [], status: 'idle', pergunta: '', ordem: 0, etapa: null });

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
    status: 'respondendo', pergunta, ordem, etapa: null,
  };
}

function erroLinha(estado: EstadoChat, mensagem: string, tipo: TipoErro): EstadoChat {
  return {
    ...estado, status: 'errou',
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
    case 'status':
      return typeof ev.text === 'string' && ev.text.trim() ? { ...estado, etapa: ev.text.trim().slice(0, 60) } : estado;
    case 'text':
      return { ...estado, linhas: respostaAberta
        ? [...linhas.slice(0, -1), { ...respostaAberta, texto: respostaAberta.texto + ev.delta }]
        : [...linhas, { id: `assistant:${estado.ordem}`, autor: 'assistant', texto: ev.delta, fontes: [], completo: false, ordem: estado.ordem }] };
    case 'sources':
      return respostaAberta ? { ...estado, linhas: [...linhas.slice(0, -1), { ...respostaAberta, fontes: ev.urls }] } : estado;
    case 'error':
      return erroLinha(estado, ev.message, 'outro');
    case 'end':
      return { ...estado, status: 'idle',
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
export const chatTemporario = (id: string): boolean => id.startsWith('temporario-');

export function guardarPendente(id: string, pergunta: string): void {
  pendentes.set(id, pergunta);
  if (Platform.OS === 'web' && !chatTemporario(id)) {
    try { sessionStorage.setItem(CHAVE + id, pergunta); } catch { /* storage blocked: memory is enough */ }
  }
}

function tomarPendente(id: string): string | null {
  let pergunta = pendentes.get(id) ?? null;
  if (!pergunta && Platform.OS === 'web' && !chatTemporario(id)) {
    try { pergunta = sessionStorage.getItem(CHAVE + id); } catch { pergunta = null; }
  }
  return pergunta;
}

function esquecerPendente(id: string): void {
  pendentes.delete(id);
  if (Platform.OS === 'web' && !chatTemporario(id)) {
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
  const temporario = chatTemporario(id);
  const descartada = useRef(false);
  const [estado, atualizarEstado] = useState<EstadoChat>(() => {
    const pergunta = tomarPendente(id);
    return pergunta ? iniciar(pergunta, 0, []) : estadoVazio();
  });
  const setEstado = useCallback((valor: EstadoChat) => {
    if (!descartada.current) atualizarEstado(valor);
  }, []);
  const [carregou, setCarregou] = useState(false);
  const [userId, setUserId] = useState<string | null>(null);
  const conversa = useRef<Conversa | null>(null);
  const controle = useRef<AbortController | null>(null);
  const turno = useRef<Turno | null>(null);
  const parado = useRef(false);
  const optsRef = useRef(opts);
  optsRef.current = opts;

  /** Streams a turn: sent now, or (`retomar`) the server's answer already underway ('sem-job' if none). */
  const responder = useCallback(async (pergunta: string, ordem: number, uid: string, retomar = false): Promise<'ok' | 'sem-job' | 'falhou'> => {
    controle.current?.abort();
    const ctrl = new AbortController();
    controle.current = ctrl;
    const alvo = { conversaId: id, ordem };
    turno.current = temporario ? null : alvo;
    // "Parar" while the pending turn was being saved: the server has no answer to stop, so the
    // stream never starts and the turn is saved as interrupted here.
    const paradoAntes = parado.current;
    if (paradoAntes) ctrl.abort();
    const salvas = (conversa.current?.mensagens ?? []).filter((m) => m.resposta !== null && m.ordem < ordem);
    let local = iniciar(pergunta, ordem, linhasSalvas(salvas));
    setEstado(local);
    const { token } = await sessaoAtual();
    if (descartada.current) return 'falhou';
    const eventos = retomar ? retomarChat(alvo, token, ctrl.signal) : streamChat({
      question: pergunta, sessionId: id, token, signal: ctrl.signal, turno: temporario ? undefined : alvo, temporario,
      history: salvas.slice(-CONTEXTO_TURNOS).map((m) => ({ pergunta: m.pergunta, resposta: m.resposta as string })),
    });
    try {
      for await (const ev of eventos) {
        local = reduzir(local, ev);
        setEstado(local);
      }
    } catch (err) {
      if (ctrl.signal.aborted) {
        // Leaving the screen also aborts: the server goes on and saves the answer. Only "Parar"
        // ends the turn, and the server saves the partial answer marked as interrupted.
        const aberta = local.linhas.find((l): l is Extract<Linha, { autor: 'assistant' }> => l.autor === 'assistant' && !l.completo);
        const encerradas = local.linhas.map((l): Linha => (l === aberta ? { ...aberta, completo: true } : l));
        setEstado({ ...local, status: 'idle', linhas: aberta || parado.current
          ? [...encerradas, { id: `nota:${local.linhas.length}`, autor: 'nota', texto: NOTA_INTERROMPIDA }] : encerradas });
        if (paradoAntes && !temporario) void anexarMensagem(uid, id, { ordem, pergunta, resposta: MARCA_INTERROMPIDA, fontes: [] }).catch(() => undefined);
        if (parado.current) {
          const texto = aberta?.texto.trim();
          const mensagens = [...salvas, { ordem, pergunta, resposta: texto ? `${texto}\n\n${MARCA_INTERROMPIDA}` : MARCA_INTERROMPIDA, fontes: [] }];
          conversa.current = { ...(conversa.current ?? {}), mensagens } as Conversa;
        }
        return 'falhou';
      }
      if (retomar && err instanceof ApiError && err.status === 404) return 'sem-job';
      const falha = traduzirFalha(err);
      void haptics.error();
      setEstado(erroLinha(local, falha.mensagem, falha.tipo));
      if (falha.tipo === 'sessao') optsRef.current.aoSessaoExpirada();
      return 'falhou';
    } finally {
      if (controle.current === ctrl) controle.current = null;
    }
    if (descartada.current) return 'falhou';
    const resposta = local.linhas.find((l): l is Extract<Linha, { autor: 'assistant' }> => l.autor === 'assistant' && l.ordem === ordem);
    if (local.status !== 'idle' || !resposta?.texto.trim()) {
      if (local.status !== 'errou') setEstado(erroLinha(local, 'A resposta chegou vazia. Tente de novo.', 'outro'));
      return 'falhou';
    }
    try {
      if (!temporario) await anexarMensagem(uid, id, { ordem, pergunta, resposta: resposta.texto, fontes: resposta.fontes });
    } catch {
      // the answer is on screen; the turn stays pending and is re-sent on the next open
    }
    const mensagens = [...salvas, { ordem, pergunta, resposta: resposta.texto, fontes: resposta.fontes }];
    const agora = new Date().toISOString();
    conversa.current = {
      ...(conversa.current ?? { id, titulo: pergunta, criada_em: agora, favorita: false }),
      mensagens, pergunta: mensagens[0].pergunta, resposta: resposta.texto, atualizada_em: agora,
    } as Conversa;
    if (!temporario) void guardarConversa(uid, conversa.current);
    if (optsRef.current.pertoDoFim && !optsRef.current.pertoDoFim()) void haptics.finished();
    if (!temporario) avisarRespostaPronta(id, pergunta);
    return 'ok';
  }, [id, temporario]);

  /** Saves the pending turn (idempotent; offline it is retried with the question) and streams it. */
  const enviarTurno = useCallback(async (pergunta: string, ordem: number, uid: string) => {
    if (!temporario) await anexarMensagem(uid, id, { ordem, pergunta }).catch((err) => console.warn('[chat] turno pendente:', err));
    await responder(pergunta, ordem, uid);
  }, [id, responder, temporario]);

  /** A pending turn: reattach to the server's answer; with none, it may have just been saved; else re-send. */
  const retomarTurno = useCallback(async (pendente: Mensagem, uid: string) => {
    if (await responder(pendente.pergunta, pendente.ordem, uid, true) !== 'sem-job') return;
    const atual = await lerConversa(uid, id).catch(() => null);
    if (atual?.mensagens.some((m) => m.ordem === pendente.ordem && m.resposta !== null)) {
      conversa.current = atual;
      setEstado({ ...estadoVazio(), linhas: linhasSalvas(atual.mensagens), ordem: atual.mensagens.length });
      return;
    }
    await enviarTurno(pendente.pergunta, pendente.ordem, uid);
  }, [id, responder, enviarTurno]);

  useEffect(() => {
    let ativo = true;
    void (async () => {
      const { userId: uid } = await sessaoAtual();
      if (!ativo || descartada.current) return;
      if (!uid) {
        optsRef.current.aoSessaoExpirada();
        return;
      }
      setUserId(uid);
      const linha = temporario ? null : await lerConversa(uid, id).catch(() => null) ?? await conversaEmCache(uid, id);
      if (!ativo) return;
      conversa.current = linha;
      setCarregou(true);
      const salvas = linha?.mensagens ?? [];
      const pendente = salvas.find((m) => m.resposta === null);
      const nova = tomarPendente(id);
      esquecerPendente(id);
      if (pendente) void retomarTurno(pendente, uid);
      else if (nova && !salvas.length) void enviarTurno(nova, 0, uid);
      else setEstado({ ...estadoVazio(), linhas: linhasSalvas(salvas), ordem: salvas.length });
    })();
    return () => {
      ativo = false;
      controle.current?.abort();
    };
  }, [id, enviarTurno, retomarTurno, temporario]);

  const send = useCallback((texto: string) => {
    const pergunta = texto.trim();
    if (!pergunta || !userId || descartada.current) return;
    void haptics.send();
    if (!temporario) void aoPerguntar();
    const respondidas = (conversa.current?.mensagens ?? []).filter((m) => m.resposta !== null).length;
    const repetir = estado.status === 'errou' && estado.pergunta === pergunta;
    const ordem = repetir ? estado.ordem : respondidas;
    // The question shows at once (it pops up from the composer); saving the pending turn first
    // takes a round trip or two.
    parado.current = false;
    const salvas = (conversa.current?.mensagens ?? []).filter((m) => m.resposta !== null && m.ordem < ordem);
    setEstado(iniciar(pergunta, ordem, linhasSalvas(salvas)));
    void enviarTurno(pergunta, ordem, userId);
  }, [userId, estado.status, estado.pergunta, estado.ordem, enviarTurno, temporario]);

  const stop = useCallback(() => {
    void haptics.press();
    parado.current = true;
    // Before the stream begins there is nothing on the server to stop (see `responder`).
    const atual = controle.current ? turno.current : null;
    if (atual) void sessaoAtual().then(({ token }) => pararChat(atual, token));
    controle.current?.abort();
  }, []);

  const descartar = useCallback(() => {
    if (!temporario) return;
    descartada.current = true;
    controle.current?.abort();
    conversa.current = null;
    esquecerPendente(id);
    atualizarEstado(estadoVazio());
    setUserId(null);
    setCarregou(true);
  }, [id, temporario]);

  return { ...estado, carregou, userId, send, stop, temporario, descartar };
}
