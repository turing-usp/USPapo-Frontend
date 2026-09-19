/**
 * useChat — the streaming chat seam (P8).
 *
 * One conversation = one `conversas` row (row id = the conversation uuid =
 * the backend `session_id`). The P9 pending rule, applied per send:
 *
 * - SEND: `anexarTurno(userId, id, pergunta)` inserts the row with
 *   `resposta = null` (pending) BEFORE the stream starts;
 * - COMPLETION: `anexarTurno(userId, id, pergunta, texto)` runs ONLY on a
 *   successful stream end, and the store's `resposta IS NULL` filter makes a
 *   duplicate/late completion a no-op (a saved resposta is never
 *   overwritten);
 * - A stream that dies mid-way (provider error, 429, Stop pressed) never
 *   reaches the completion call: the row stays pending, and the next open of
 *   the conversation re-streams the question (ported from the old site's
 *   "complete the pending answer on open" effect).
 *
 * A question asked AFTER the answer completed starts a NEW conversation (the
 * screen routes it through the pendente Map + navigation, exactly like the
 * home screen): the row model is one-per-conversation by construction, and
 * the context of the previous turns travels with the request in the
 * `historico` wire field (last pairs of the user's turns), so the follow-up
 * still reads as a conversation.
 *
 * Error model (see lib/api):
 * - 401 (thrown ChatApiError or the 'Sua sessão expirou' fast-fail) →
 *   tipo 'sessao': the screen redirects to /(auth)/login;
 * - 429 (thrown ChatApiError with retryAfter) → tipo 'limite': the wait is
 *   converted to a pt-BR duration ("Tente novamente em 2 minutos");
 * - in-stream `error` events carry the backend's pt-BR message verbatim
 *   (MSG_BUSY / MSG_INTERRUPTED);
 * - aborted (Stop) → the partial answer stays on screen with a note, the
 *   row stays pending, no error is surfaced;
 * - anything else → the lib/auth.mapAuthError message (network failures get
 *   the connection wording).
 *
 * Math: assistant text with LaTeX ($…$ / $$…$$) renders as a KaTeX WebView
 * only when the turn is COMPLETE (components/chat/Matematica); while
 * streaming the raw text is shown — no re-parse per delta.
 */
import { useCallback, useEffect, useRef, useState } from 'react';

import {
  ChatApiError,
  labelDaFerramenta,
  streamChat,
  type ChatEvent,
} from '../../../lib/api';
import { mapAuthError } from '../../../lib/auth';
import { anexarTurno, lerHistorico, type Conversa } from '../../../lib/conversations';
import { haptics } from '../../../lib/haptics';
import { supabase } from '../../../lib/supabase';
import { lerPendente } from '../pendente';

// ─────────────────────────────────────────────
// State model
// ─────────────────────────────────────────────

/** One line of the chat list (rendered in order). */
export type Turno =
  | { id: string; autor: 'user'; texto: string }
  | {
      id: string;
      autor: 'assistant';
      /** Growing while the stream runs; frozen on completion. */
      texto: string;
      /** Source URLs of the completed answer (the `sources` event). */
      fontes: string[];
      /** True once the stream finished with a successful `end`. */
      completo: boolean;
    }
  | {
      id: string;
      autor: 'ferramenta';
      /** Tool-call index (the backend's `index`; -1 = pre-consultation). */
      indice: number;
      /** pt-BR label (TOOL_LABELS) or the raw tool name. */
      rotulo: string;
      /** start..end: false while the tool is running, true when done. */
      pronta: boolean;
      /** Number of source URLs the tool returned (the `results` field). */
      resultados: number;
    }
  | { id: string; autor: 'erro'; mensagem: string; tipo: TipoErro }
  | { id: string; autor: 'nota'; texto: string };

export type TipoErro = 'sessao' | 'limite' | 'outro';

export type ErroChat = {
  tipo: TipoErro;
  mensagem: string;
};

export type ChatStatus = 'idle' | 'respondendo' | 'errou';

/** The streaming state the reducer maintains (a superset of the UI turns). */
export type EstadoChat = {
  turnos: Turno[];
  status: ChatStatus;
  erro: ErroChat | null;
  /** The question in flight (the "Tentar de novo" target). */
  pergunta: string;
  /** True when the stream ended with a successful `end` (answer persisted). */
  concluido: boolean;
  /** The model is emitting the final answer text right now (old site's
   *  `escrevendo`): the growing text itself is the progress feedback. */
  escrevendo: boolean;
  /** Tool-call indices currently running (start without a matching end). */
  ferramentas: Record<number, string>;
};

/** The initial state of a question about to be sent (user bubble already
 *  on screen, stream not started). */
export function estadoInicial(pergunta: string): EstadoChat {
  return {
    turnos: [{ id: 'user:0', autor: 'user', texto: pergunta }],
    status: 'respondendo',
    erro: null,
    pergunta,
    concluido: false,
    escrevendo: false,
    ferramentas: {},
  };
}

/** An idle, empty conversation (the "Não encontrei esta conversa" screen). */
export function estadoVazio(): EstadoChat {
  return {
    turnos: [],
    status: 'idle',
    erro: null,
    pergunta: '',
    concluido: false,
    escrevendo: false,
    ferramentas: {},
  };
}

// ─────────────────────────────────────────────
// Pure reducer: one SSE event → new state (the jest contract)
// ─────────────────────────────────────────────

/**
 * Applies one `ChatEvent` to the streaming state. Pure and synchronous —
 * the full sequence the backend emits (provedor → pensando → tool → text →
 * sources → end) folds into the final state, which is what the tests feed
 * against a fake streamChat.
 *
 * - `provedor` / `pensando` → 'respondendo' + the thinking indicator is
 *   implied (nothing is visible yet while `escrevendo` is false);
 * - `tool` start → a tool-status line with its index and the pt-BR label;
 * - `tool` end → the line is marked done with the results count;
 * - `text` delta → appended to the current assistant turn (incremental);
 * - `sources` → the assistant turn's URLs;
 * - `error` → status 'errou' with the message (the backend's pt-BR text
 *   verbatim — MSG_BUSY / MSG_INTERRUPTED);
 * - `end` → success: 'idle' + the answer marked complete (the hook persists
 *   it); failure: stays 'errou'.
 */
export function reduzirEvento(estado: EstadoChat, evento: ChatEvent): EstadoChat {
  // The backend's invariant: after an `error` the stream is terminal (a
  // final `end` only confirms it) — late events must not touch the state.
  if (estado.status === 'errou' && evento.type !== 'end') return estado;

  switch (evento.type) {
    case 'provedor':
      // Provider switch: no visible surface (the old site hid it too).
      return estado;

    case 'pensando':
      return { ...estado, status: 'respondendo', escrevendo: false };

    case 'tool': {
      const turnos = estado.turnos;
      if (evento.state === 'start') {
        const rotulo = labelDaFerramenta(evento.name);
        const linha: Turno = {
          id: `ferramenta:${evento.index}`,
          autor: 'ferramenta',
          indice: evento.index,
          rotulo,
          pronta: false,
          resultados: 0,
        };
        const ferramentas = { ...estado.ferramentas, [evento.index]: evento.name };
        return { ...estado, status: 'respondendo', escrevendo: false, turnos: [...turnos, linha], ferramentas };
      }
      const ferramentas = { ...estado.ferramentas };
      delete ferramentas[evento.index];
      const resultados = evento.results ?? 0;
      return {
        ...estado,
        status: 'respondendo',
        escrevendo: false,
        ferramentas,
        turnos: turnos.map((t): Turno =>
          t.autor === 'ferramenta' && t.indice === evento.index
            ? { ...t, pronta: true, resultados }
            : t,
        ),
      };
    }

    case 'text': {
      const turnos = estado.turnos;
      const ultimo = turnos[turnos.length - 1];
      const novo: Turno = {
        id: `assistant:${turnos.length}`,
        autor: 'assistant',
        texto: evento.delta,
        fontes: [],
        completo: false,
      };
      const comTexto =
        ultimo && ultimo.autor === 'assistant'
          ? [...turnos.slice(0, -1), { ...ultimo, texto: ultimo.texto + evento.delta }]
          : [...turnos, novo];
      return { ...estado, status: 'respondendo', escrevendo: true, turnos: comTexto };
    }

    case 'sources': {
      const turnos = estado.turnos;
      const ultimo = turnos[turnos.length - 1];
      if (!ultimo || ultimo.autor !== 'assistant') return estado;
      return {
        ...estado,
        turnos: [...turnos.slice(0, -1), { ...ultimo, fontes: evento.urls }],
      };
    }

    case 'error':
      return {
        ...estado,
        status: 'errou',
        escrevendo: false,
        ferramentas: {},
        erro: { tipo: 'outro', mensagem: evento.message },
        turnos: [
          ...estado.turnos,
          {
            id: `erro:${estado.turnos.length}`,
            autor: 'erro',
            mensagem: evento.message,
            tipo: 'outro',
          },
        ],
      };

    case 'end':
      if (estado.erro) {
        // The failure invariant (error + end): stays in the error state.
        return { ...estado, status: 'errou', escrevendo: false, ferramentas: {} };
      }
      const turnos = estado.turnos;
      const ultimo = turnos[turnos.length - 1];
      const comFim =
        ultimo && ultimo.autor === 'assistant'
          ? [...turnos.slice(0, -1), { ...ultimo, completo: true }]
          : turnos;
      return {
        ...estado,
        status: 'idle',
        concluido: true,
        escrevendo: false,
        ferramentas: {},
        turnos: comFim,
      };

    default:
      return estado;
  }
}

// ─────────────────────────────────────────────
// pt-BR duration (port of the backend's _wait_readable)
// ─────────────────────────────────────────────

/**
 * Seconds → pt-BR duration ("30 segundos", "2 minutos", "3 horas") — the
 * same rules as the backend's `_wait_readable`, so the client-side 429
 * message and the backend's body agree.
 */
export function duracaoEmPortugues(segundos: number): string {
  if (segundos < 60) return `${segundos} segundo${segundos === 1 ? '' : 's'}`;
  const minutos = Math.round(segundos / 60);
  if (minutos < 60) return `${minutos} minuto${minutos === 1 ? '' : 's'}`;
  const horas = Math.round(minutos / 60);
  return `${horas} hora${horas === 1 ? '' : 's'}`;
}

/**
 * Translates a thrown stream failure into the chat error model.
 *
 * - aborted signal (the Stop button) → a neutral note, NOT an error;
 * - ChatApiError 401 → 'Sua sessão expirou' (tipo 'sessao');
 * - ChatApiError 429 → 'Tente novamente em <duração>' (tipo 'limite');
 * - the lib/api no-token fast-fail (Error('Sua sessão expirou')) → 'sessao';
 * - TypeError (network down) → the lib/auth connection message;
 * - anything else → the generic retry-later wording.
 */
export function traduzirFalha(erro: unknown, signal: AbortSignal): ErroChat {
  if (signal.aborted) {
    return { tipo: 'outro', mensagem: 'A resposta foi interrompida.' };
  }
  if (erro instanceof ChatApiError) {
    if (erro.status === 401) {
      return { tipo: 'sessao', mensagem: 'Sua sessão expirou' };
    }
    if (erro.status === 429) {
      return {
        tipo: 'limite',
        mensagem:
          erro.retryAfter != null
            ? `Tente novamente em ${duracaoEmPortugues(erro.retryAfter)}`
            : erro.message,
      };
    }
    return { tipo: 'outro', mensagem: erro.message };
  }
  const mensagem =
    typeof erro === 'object' && erro !== null && 'message' in erro
      ? String((erro as { message: unknown }).message)
      : '';
  if (mensagem.includes('Sua sessão expirou')) {
    return { tipo: 'sessao', mensagem: 'Sua sessão expirou' };
  }
  if (erro instanceof TypeError) {
    return { tipo: 'outro', mensagem: mapAuthError(erro) };
  }
  return {
    tipo: 'outro',
    mensagem: mensagem || 'Não consegui falar com o USPapo agora. Tente de novo em instantes.',
  };
}

// ─────────────────────────────────────────────
// Stream runner (the jest contract: fake streamChat, fake conversations)
// ─────────────────────────────────────────────

export type ResultadoResposta =
  | { ok: true; estado: EstadoChat; texto: string; fontes: string[] }
  | { ok: false; estado: EstadoChat; erro: ErroChat; interrompido: boolean };

export type OpcoesResposta = {
  userId: string;
  pergunta: string;
  /**
   * Previous turns as context, oldest first — the wire pairs
   * `{pergunta, resposta}` (pending rows with resposta null are skipped
   * before this call; the backend keeps its own MAX_HISTORY_TURNS).
   */
  historico: { pergunta: string; resposta: string }[];
  /** Conversation uuid — the backend `session_id` and the row id. */
  sessionId: string;
  /** Supabase access token (Authorization: Bearer). */
  token: string;
  /** Aborts the in-flight stream (the Stop button). */
  signal: AbortSignal;
  /** Subscribes to the incremental state (the hook forwards to React). */
  aoEstado?: (estado: EstadoChat) => void;
  /** Session expired (401 / no token): the caller redirects to login. */
  aoSessaoExpirada?: () => void;
};

/**
 * Sends one question and streams the answer, folding every event into the
 * state (reduzirEvento). On a SUCCESSFUL end it persists the FULL text via
 * `anexarTurno` (the P9 completion call). A thrown failure or an in-stream
 * `error` event never persists: the row stays pending.
 *
 * This is the unit the jest tests drive with a mocked lib/api +
 * lib/conversations; the hook is a thin React wrapper around it.
 */
export async function executarResposta(o: OpcoesResposta): Promise<ResultadoResposta> {
  let estado = estadoInicial(o.pergunta);
  let texto = '';
  let fontes: string[] = [];

  const aoEvento = (ev: ChatEvent): void => {
    estado = reduzirEvento(estado, ev);
    if (ev.type === 'text') texto += ev.delta;
    if (ev.type === 'sources') fontes = ev.urls;
    o.aoEstado?.(estado);
  };

  try {
    for await (const evento of streamChat({
      question: o.pergunta,
      history: o.historico.length > 0 ? o.historico : undefined,
      sessionId: o.sessionId,
      token: o.token,
      signal: o.signal,
    })) {
      aoEvento(evento);
    }
  } catch (err) {
    const traduzido = traduzirFalha(err, o.signal);
    if (o.signal.aborted) {
      // Stop pressed: the caller owns the final state (the partial text +
      // the interruption note); the row stays pending (P9).
      o.aoEstado?.(estado);
      return { ok: false, estado, erro: traduzido, interrompido: true };
    }
    estado = { ...estado, status: 'errou', erro: traduzido };
    o.aoEstado?.(estado);
    if (traduzido.tipo === 'sessao') o.aoSessaoExpirada?.();
    return { ok: false, estado, erro: traduzido, interrompido: false };
  }

  o.aoEstado?.(estado);

  if (estado.erro) {
    // The backend's failure invariant: `error` followed by `end`.
    return {
      ok: false,
      estado: { ...estado, status: 'errou' },
      erro: estado.erro,
      interrompido: false,
    };
  }

  const textoFinal = texto.trim() !== '' ? texto : ultimoTexto(estado);
  if (textoFinal !== '') {
    // P9 completion: sets resposta only on the still-pending row; a saved
    // resposta is never overwritten (the store filters on resposta IS NULL).
    await anexarTurno(o.userId, o.sessionId, o.pergunta, textoFinal);
  }
  return { ok: true, estado, texto: textoFinal, fontes };
}

/** The assistant turn's accumulated text ('' when none was emitted). */
function ultimoTexto(estado: EstadoChat): string {
  for (let i = estado.turnos.length - 1; i >= 0; i--) {
    const t = estado.turnos[i];
    if (t.autor === 'assistant' && t.texto !== '') return t.texto;
  }
  return '';
}

/** Appends (once) the "interruption" note under a partial answer. */
export function comNotaInterrompida(turnos: Turno[]): Turno[] {
  const parcial = turnos.some((t) => t.autor === 'assistant' && t.texto !== '');
  if (!parcial) return turnos;
  if (turnos.some((t) => t.autor === 'nota' && t.texto === NOTA_INTERROMPIDA)) return turnos;
  return [...turnos, { id: 'nota:interrompida', autor: 'nota', texto: NOTA_INTERROMPIDA }];
}

const NOTA_INTERROMPIDA = 'A resposta foi interrompida.';

// ─────────────────────────────────────────────
// The hook
// ─────────────────────────────────────────────

/** How many previous {pergunta, resposta} pairs travel as context (the task
 *  budget; the backend prunes by its own token ceiling anyway). */
const PAIRES_CONTEXTO = 6;

export type UseChat = {
  turns: Turno[];
  status: ChatStatus;
  /** The last question sent (the "Tentar de novo" target). */
  pergunta: string | null;
  erro: ErroChat | null;
  /** True when the last answer completed and was persisted. */
  concluido: boolean;
  /** True once the mount load (lerHistorico) resolved for this id. */
  carregou: boolean;
  /** The `favorita` flag of the loaded row (the like button's initial state). */
  favorita: boolean;
  /** The Supabase user id (for the favoritar calls). */
  userId: string | null;
  send: (pergunta: string) => void;
  stop: () => void;
};

export type OpcoesUseChat = {
  enabled?: boolean;
  /**
   * Session expired (401 / no token): the screen wires this to
   * `router.replace('/(auth)/login')` (the fast-fail).
   */
  aoSessaoExpirada?: () => void;
  /**
   * "Is the list scrolled near the bottom?" — the screen wires this to its
   * FlatList scroll ref; on a completed answer while scrolled away the
   * finished haptic fires (plan §3.3 mapping).
   */
  pertoDoFim?: () => boolean;
};

/** Reads the session once (the token may refresh; a fresh read per send). */
async function sessaoAtual(): Promise<{ userId: string; token: string }> {
  try {
    const { data } = await supabase.auth.getSession();
    return {
      userId: data.session?.user?.id ?? '',
      token: data.session?.access_token ?? '',
    };
  } catch {
    return { userId: '', token: '' };
  }
}

export function useChat(
  id: string | undefined,
  opts?: OpcoesUseChat,
): UseChat {
  const enabled = opts?.enabled ?? true;

  // StrictMode-safe read-once: the initializers may run twice in
  // development, but lerPendente reads WITHOUT consuming, so both reads
  // agree. The pendente entry seeds the first user bubble + the
  // 'respondendo' status on the FIRST frame — before any network or
  // persistence work (port of the existing guard pattern).
  const [estado, setEstado] = useState<EstadoChat>(() => {
    if (!id || !enabled) return estadoVazio();
    const pendente = lerPendente(id);
    return pendente ? estadoInicial(pendente.question) : estadoVazio();
  });
  const [favorita, setFavorita] = useState(false);
  const [userId, setUserId] = useState<string | null>(null);
  /** True once the mount load (lerHistorico) has resolved for this id. */
  const [carregou, setCarregou] = useState(false);

  const controllerRef = useRef<AbortController | null>(null);
  /** The loaded row of THIS conversation (set by the mount effect). */
  const linhaRef = useRef<Conversa | null | undefined>(undefined);
  /** Previous-turn context pairs for the wire (oldest first). */
  const paresRef = useRef<{ pergunta: string; resposta: string }[] | null>(null);
  const optsRef = useRef(opts);
  optsRef.current = opts;

  // ── the shared dispatcher (mount auto-start and send both use it) ──
  const disparar = useCallback(
    async (pergunta: string, sinal: AbortSignal) => {
      const { userId: uid, token } = await sessaoAtual();
      if (!uid || token === '') {
        const e: ErroChat = { tipo: 'sessao', mensagem: 'Sua sessão expirou' };
        const inicial = estadoInicial(pergunta);
        const turnos: Turno[] = [
          ...inicial.turnos,
          { id: 'erro:sessao', autor: 'erro', mensagem: e.mensagem, tipo: 'sessao' },
        ];
        setEstado({
          ...inicial,
          status: 'errou',
          erro: e,
          turnos,
        });
        optsRef.current?.aoSessaoExpirada?.();
        return;
      }
      setEstado(estadoInicial(pergunta));
      const resultado = await executarResposta({
        userId: uid,
        pergunta,
        historico: paresRef.current ?? [],
        sessionId: id ?? '',
        token,
        signal: sinal,
        aoEstado: (e) => setEstado(e),
        aoSessaoExpirada: () => optsRef.current?.aoSessaoExpirada?.(),
      });
      if (sinal.aborted) {
        // Stop pressed: the stream died on purpose — keep the partial text,
        // no error, the row stays pending (P9).
        setEstado((atual) => ({
          ...atual,
          status: 'idle',
          concluido: atual.concluido,
          turnos: comNotaInterrompida(atual.turnos),
        }));
        return;
      }
      setEstado(resultado.estado);
      if (resultado.ok) {
        // Finished while the user scrolled AWAY → the notification haptic.
        const perto = optsRef.current?.pertoDoFim?.() ?? true;
        if (resultado.estado.concluido && !perto) {
          void haptics.finished();
        }
      } else if (!resultado.interrompido) {
        if (resultado.erro.tipo === 'sessao') {
          // The fast-fail seam already fired; nothing to show locally.
          return;
        }
        void haptics.error();
      }
    },
    [id],
  );

  // ── mount: load the saved conversation and start what is owed ──
  useEffect(() => {
    if (!id || !enabled) return;
    const controller = new AbortController();
    let ativo = true;
    (async () => {
      const { userId: uid } = await sessaoAtual();
      if (!ativo) return;
      if (!uid) {
        setCarregou(true);
        optsRef.current?.aoSessaoExpirada?.();
        return;
      }
      setUserId(uid);

      let linha: Conversa | null = null;
      let pares: { pergunta: string; resposta: string }[] = [];
      try {
        const historico = await lerHistorico(uid);
        if (!ativo) return;
        setCarregou(true);
        linha = historico.find((c) => c.id === id) ?? null;
        // Context pairs: the completed turns only (the pending rows with
        // resposta null are skipped — the backend would drop them anyway),
        // oldest first, last PAIRES_CONTEXTO pairs (the wire budget).
        pares = historico
          .filter((c) => c.resposta !== null)
          .reverse()
          .slice(-PAIRES_CONTEXTO)
          .map((c) => ({ pergunta: c.pergunta, resposta: c.resposta as string }));
        paresRef.current = pares;
      } catch (err) {
        // A read failure must not blank the conversation: continue without
        // context (the pending seed already on screen keeps it honest).
        console.error('[useChat] lerHistorico falhou:', err);
        if (!ativo) return;
        setCarregou(true);
      }

      if (linha) {
        linhaRef.current = linha;
        setFavorita(linha.favorita);
      }

      if (linha && linha.resposta !== null) {
        // Saved, complete conversation: render it (the pendente seed, if a
        // stale entry lingered in memory, is replaced by the saved turn).
        if (!ativo) return;
        setEstado({
          ...estadoVazio(),
          turnos: [
            { id: 'user:0', autor: 'user', texto: linha.pergunta },
            {
              id: 'assistant:1',
              autor: 'assistant',
              texto: linha.resposta,
              fontes: [],
              completo: true,
            },
          ],
          pergunta: linha.pergunta,
          concluido: true,
        });
        return;
      }

      const pendente = lerPendente(id);
      const pergunta =
        linha && linha.resposta === null
          ? linha.pergunta // the stream died mid-way last time: re-send it
          : pendente
            ? pendente.question // fresh conversation from the home screen
            : null;

      if (!pergunta || !ativo) return;

      // P9: the pending row is inserted with resposta = null BEFORE the
      // stream. A duplicate insert (StrictMode's second effect run, or a
      // double-tap) is the unique constraint talking — treat the row as
      // existing and go on.
      if (!linha) {
        try {
          await anexarTurno(uid, id, pergunta);
        } catch (err) {
          console.warn('[useChat] insert do turno pendente ignorado (já existe?):', err);
        }
        linhaRef.current = {
          id,
          pergunta,
          resposta: null,
          criada_em: new Date().toISOString(),
          atualizada_em: new Date().toISOString(),
          favorita: false,
        };
      }
      if (!ativo) return;
      // For a pending row the synchronous pendente seed (or nothing, when the
      // question came from a saved pending row) is already on screen; start.
      void disparar(pergunta, controller.signal);
    })();
    return () => {
      ativo = false;
      controller.abort();
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [id, enabled, disparar]);

  // ── send: the composer / "Tentar de novo" (same conversation only) ──
  const send = useCallback(
    (pergunta: string) => {
      const limpo = pergunta.trim();
      if (!id || !enabled || limpo === '') return;
      void haptics.send();
      if (controllerRef.current) {
        controllerRef.current.abort();
        controllerRef.current = null;
      }
      const controller = new AbortController();
      controllerRef.current = controller;
      void (async () => {
        const { userId: uid } = await sessaoAtual();
        if (!uid) {
          optsRef.current?.aoSessaoExpirada?.();
          return;
        }
        // The retry rule: the pending row already exists (it was inserted on
        // the first send and the stream died) — skip the insert, otherwise
        // the unique constraint would reject it.
        if (!linhaRef.current) {
          try {
            await anexarTurno(uid, id, limpo);
          } catch (err) {
            console.warn('[useChat] insert do turno pendente ignorado (já existe?):', err);
          }
          linhaRef.current = {
            id,
            pergunta: limpo,
            resposta: null,
            criada_em: new Date().toISOString(),
            atualizada_em: new Date().toISOString(),
            favorita: false,
          };
        }
        await disparar(limpo, controller.signal);
      })();
    },
    [id, enabled, disparar],
  );

  // ── stop: abort the in-flight stream ──
  const stop = useCallback(() => {
    controllerRef.current?.abort();
    controllerRef.current = null;
  }, []);

  return {
    turns: estado.turnos,
    status: estado.status,
    pergunta: estado.pergunta || null,
    erro: estado.erro,
    concluido: estado.concluido,
    carregou,
    favorita,
    userId,
    send,
    stop,
  };
}
