/**
 * useChat — the streaming chat seam (P8).
 *
 * One conversation = one `conversas` row with a LIST of turns (`mensagens`,
 * ordered by `ordem`). A follow-up question is a new turn of the SAME
 * conversation: the earlier turns stay on screen and travel with the request
 * in the `historico` wire field. (An earlier version started a brand-new
 * conversation per question, which is why a multi-turn chat showed only the
 * last question and answer — the previous turns were in another row, on
 * another screen.)
 *
 * The P9 pending rule, applied per TURN:
 *
 * - SEND: the turn is inserted with `resposta = null` (pending) BEFORE the
 *   stream starts (`anexarMensagem` with no resposta);
 * - COMPLETION: the resposta is written ONLY on a successful stream end, and
 *   the store's `resposta IS NULL` filter — scoped to that `ordem` — makes a
 *   duplicate/late completion a no-op (a saved resposta is never
 *   overwritten, and completing turn 3 cannot touch turn 1);
 * - A stream that dies mid-way (provider error, 429, Stop pressed) never
 *   reaches the completion call: the turn stays pending, and the next open of
 *   the conversation re-streams that question (ported from the old site's
 *   "complete the pending answer on open" effect).
 *
 * Error model (see lib/api):
 * - 401 (thrown ChatApiError or the 'Sua sessão expirou' fast-fail) →
 *   tipo 'sessao': the screen redirects to /(auth)/login;
 * - 429 (thrown ChatApiError with retryAfter) → tipo 'limite': the wait is
 *   converted to a pt-BR duration ("Tente novamente em 2 minutos");
 * - in-stream `error` events carry the backend's pt-BR message verbatim
 *   (MSG_BUSY / MSG_INTERRUPTED);
 * - aborted (Stop) → the partial answer stays on screen with a note, the
 *   turn stays pending, no error is surfaced;
 * - anything else → the lib/auth.mapAuthError message (network failures get
 *   the connection wording).
 *
 * Rendering: components/chat/Resposta renders the answer as markdown and
 * paces the reveal while the stream runs; LaTeX still goes through the KaTeX
 * WebView (components/chat/Matematica) when the turn is complete and the
 * optional package is installed.
 */
import { useCallback, useEffect, useRef, useState } from 'react';

import {
  ChatApiError,
  labelDaFerramenta,
  streamChat,
  type ChatEvent,
} from '../../../lib/api';
import { mapAuthError } from '../../../lib/auth';
import { conversaPorIdOffline, salvarConversa } from '../../../lib/cache';
import {
  anexarMensagem,
  lerConversa,
  type Conversa,
  type Mensagem,
} from '../../../lib/conversations';
import { haptics } from '../../../lib/haptics';
import { filaPendente, queue } from '../../../lib/net';
import {
  eFalhaDeRede,
  marcarFalhaRede,
  marcarSucessoRede,
  registrarReprocessador,
  usandoCache,
} from '../../../lib/offline';
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

/**
 * The initial state of a question about to be sent: the turns already on
 * screen, plus the new user bubble. `anteriores` is what makes a follow-up
 * read as a conversation instead of replacing it — the earlier turns stay
 * exactly where they were, and everything the reducer does from here lands
 * AFTER them.
 */
export function estadoInicial(pergunta: string, anteriores: Turno[] = []): EstadoChat {
  return {
    turnos: [
      ...anteriores,
      { id: `user:${anteriores.length}`, autor: 'user', texto: pergunta },
    ],
    status: 'respondendo',
    erro: null,
    pergunta,
    concluido: false,
    escrevendo: false,
    ferramentas: {},
  };
}

/**
 * The lines of the turn being answered right now: everything after the last
 * user bubble.
 *
 * The screen's "thinking" indicator and the interruption note both ask
 * "has anything arrived yet?", and with earlier turns on screen the answer
 * would always be yes — the previous answer is right there. Scoping the
 * question to the current turn is what keeps them honest.
 */
export function turnoAtual(turnos: Turno[]): Turno[] {
  for (let i = turnos.length - 1; i >= 0; i--) {
    if (turnos[i].autor === 'user') return turnos.slice(i + 1);
  }
  return turnos;
}

/** The UI lines for one saved turn: the question, then its answer. */
function turnosDaMensagem(m: Mensagem): Turno[] {
  const linhas: Turno[] = [
    { id: `user:${m.ordem}`, autor: 'user', texto: m.pergunta },
  ];
  if (m.resposta !== null) {
    linhas.push({
      id: `assistant:${m.ordem}`,
      autor: 'assistant',
      texto: m.resposta,
      fontes: m.fontes,
      completo: true,
    });
  }
  return linhas;
}

/**
 * The saved conversation as chat lines. A trailing PENDING turn (resposta
 * null) is left out on purpose: it is the question about to be re-streamed,
 * and `estadoInicial` puts its bubble back at the head of the new attempt.
 */
export function turnosSalvos(mensagens: Mensagem[]): Turno[] {
  return mensagens
    .filter((m) => m.resposta !== null)
    .flatMap(turnosDaMensagem);
}

/** The wire context pairs of a conversation: its completed turns, in order. */
export function paresDaConversa(
  mensagens: Mensagem[],
  quantos: number,
): { pergunta: string; resposta: string }[] {
  return mensagens
    .filter((m) => m.resposta !== null)
    .slice(-quantos)
    .map((m) => ({ pergunta: m.pergunta, resposta: m.resposta as string }));
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
      // `!ultimo.completo` is what keeps a follow-up out of the PREVIOUS
      // answer: with earlier turns on screen the last line is a finished
      // assistant turn, and appending to it would grow the old answer
      // instead of starting the new one.
      const comTexto =
        ultimo && ultimo.autor === 'assistant' && !ultimo.completo
          ? [...turnos.slice(0, -1), { ...ultimo, texto: ultimo.texto + evento.delta }]
          : [...turnos, novo];
      return { ...estado, status: 'respondendo', escrevendo: true, turnos: comTexto };
    }

    case 'sources': {
      const turnos = estado.turnos;
      const ultimo = turnos[turnos.length - 1];
      if (!ultimo || ultimo.autor !== 'assistant' || ultimo.completo) return estado;
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
        ultimo && ultimo.autor === 'assistant' && !ultimo.completo
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
  | {
      ok: false;
      estado: EstadoChat;
      erro: ErroChat;
      interrompido: boolean;
      /**
       * True when the failure was a NETWORK one (the server never answered
       * — offline). The only failures the question may be queued for
       * replay; 4xx/5xx (429/401) answered and are never queued.
       */
      falhaDeRede: boolean;
    };

export type OpcoesResposta = {
  userId: string;
  pergunta: string;
  /**
   * Previous turns as context, oldest first — the wire pairs
   * `{pergunta, resposta}` (pending turns with resposta null are skipped
   * before this call; the backend keeps its own MAX_HISTORY_TURNS).
   */
  historico: { pergunta: string; resposta: string }[];
  /** Conversation uuid — the backend `session_id` and the row id. */
  sessionId: string;
  /** Position of THIS turn in the conversation (`mensagens.ordem`). */
  ordem?: number;
  /** The turns already on screen, so the new one lands after them. */
  anteriores?: Turno[];
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
  let estado = estadoInicial(o.pergunta, o.anteriores ?? []);
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
      return { ok: false, estado, erro: traduzido, interrompido: true, falhaDeRede: false };
    }
    estado = { ...estado, status: 'errou', erro: traduzido };
    o.aoEstado?.(estado);
    if (traduzido.tipo === 'sessao') o.aoSessaoExpirada?.();
    return {
      ok: false,
      estado,
      erro: traduzido,
      interrompido: false,
      // The offline queue gate: only a network failure (no response) counts.
      falhaDeRede: eFalhaDeRede(err, o.signal),
    };
  }

  o.aoEstado?.(estado);

  if (estado.erro) {
    // The backend's failure invariant: `error` followed by `end`. The
    // server ANSWERED — never a network failure, never queued.
    return {
      ok: false,
      estado: { ...estado, status: 'errou' },
      erro: estado.erro,
      interrompido: false,
      falhaDeRede: false,
    };
  }

  const textoFinal = texto.trim() !== '' ? texto : ultimoTexto(estado);
  if (textoFinal !== '') {
    // P9 completion: sets resposta only on the still-pending turn AT THIS
    // ORDEM; a saved resposta is never overwritten (the store filters on
    // resposta IS NULL) and an earlier turn is never touched.
    await anexarMensagem(o.userId, o.sessionId, {
      ordem: o.ordem ?? 0,
      pergunta: o.pergunta,
      resposta: textoFinal,
      fontes,
    });
  }
  return { ok: true, estado, texto: textoFinal, fontes };
}

/** The CURRENT turn's accumulated text ('' when none was emitted). */
function ultimoTexto(estado: EstadoChat): string {
  const atual = turnoAtual(estado.turnos);
  for (let i = atual.length - 1; i >= 0; i--) {
    const t = atual[i];
    if (t.autor === 'assistant' && t.texto !== '') return t.texto;
  }
  return '';
}

/**
 * Appends (once) the "interruption" note under a partial answer.
 *
 * Only the CURRENT turn counts: a finished answer higher up the conversation
 * is not the thing that was interrupted.
 */
export function comNotaInterrompida(turnos: Turno[]): Turno[] {
  const atual = turnoAtual(turnos);
  const parcial = atual.some(
    (t) => t.autor === 'assistant' && !t.completo && t.texto !== '',
  );
  if (!parcial) return turnos;
  if (atual.some((t) => t.autor === 'nota' && t.texto === NOTA_INTERROMPIDA)) return turnos;
  return [
    ...turnos,
    { id: `nota:interrompida:${turnos.length}`, autor: 'nota', texto: NOTA_INTERROMPIDA },
  ];
}

const NOTA_INTERROMPIDA = 'A resposta foi interrompida.';

/** The honest offline state (pt-BR): the question was queued and will be
 *  replayed in order when the connection returns. */
const MENSAGEM_SEM_CONEXAO = 'Sem conexão — enviaremos quando a internet voltar.';

/**
 * The offline failure handler (the queue seam, kept OUTSIDE the React hook
 * so the tests drive it): marks the last operation as a network failure,
 * parks the question in the lib/net queue (persisted — survives a restart)
 * and keeps the conversation in the offline cache with its pending turn
 * (resposta null) so the history screen renders it with no network.
 */
export async function tratarFalhaDeRede(
  userId: string,
  sessionId: string,
  pergunta: string,
  turno = 0,
  anteriores: Mensagem[] = [],
): Promise<void> {
  marcarFalhaRede();
  await queue.enqueue({
    id: sessionId,
    conversationId: sessionId,
    question: pergunta,
    enqueuedAt: Date.now(),
    turno,
  });
  try {
    const agora = new Date().toISOString();
    const mensagens: Mensagem[] = [
      ...anteriores.filter((m) => m.ordem !== turno),
      { ordem: turno, pergunta, resposta: null, fontes: [] },
    ].sort((a, b) => a.ordem - b.ordem);
    await salvarConversa({
      id: sessionId,
      user_id: userId,
      titulo: mensagens[0]?.pergunta ?? pergunta,
      mensagens,
      fontes: [],
      pergunta: mensagens[0]?.pergunta ?? pergunta,
      resposta: null,
      criada_em: agora,
      atualizada_em: agora,
      favorita: false,
    });
  } catch (err) {
    console.warn('[useChat] cache offline do turno pendente ignorado:', err);
  }
}

/** Mirrors a conversation into the offline cache (write-through). */
async function cachearConversa(
  userId: string,
  id: string,
  mensagens: Mensagem[],
  base: Conversa | null,
): Promise<void> {
  const agora = new Date().toISOString();
  const ultima = mensagens[mensagens.length - 1];
  await salvarConversa({
    id,
    user_id: userId,
    titulo: base?.titulo || mensagens[0]?.pergunta || '',
    mensagens,
    fontes: ultima?.fontes ?? [],
    pergunta: mensagens[0]?.pergunta ?? '',
    resposta: ultima?.resposta ?? null,
    criada_em: base?.criada_em ?? agora,
    atualizada_em: agora,
    favorita: base?.favorita ?? false,
  });
}

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
  /** True once the mount load resolved for this id. */
  carregou: boolean;
  /** The `favorita` flag of the loaded row (the like button's initial state). */
  favorita: boolean;
  /** The Supabase user id (for the favoritar calls). */
  userId: string | null;
  /** Position of the turn in flight / last answered (`mensagens.ordem`). */
  ordem: number;
  /** True when the last network operation failed without a response
   *  (offline — the honest "Sem conexão" state). */
  semConexao: boolean;
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
  /** True once the mount load has resolved for this id. */
  const [carregou, setCarregou] = useState(false);

  const controllerRef = useRef<AbortController | null>(null);
  /** The loaded row of THIS conversation (set by the mount effect). */
  const linhaRef = useRef<Conversa | null>(null);
  /**
   * Every turn of this conversation, as persisted. It is the source for
   * three things at once: the lines already on screen, the wire context of
   * the next question, and the `ordem` of the turn being written.
   */
  const mensagensRef = useRef<Mensagem[]>([]);
  /** The ordem of the turn in flight (or of the last one answered). */
  const ordemRef = useRef(0);
  const optsRef = useRef(opts);
  optsRef.current = opts;

  // ── the shared dispatcher (mount auto-start and send both use it) ──
  const disparar = useCallback(
    async (pergunta: string, ordem: number, sinal: AbortSignal) => {
      const anteriores = turnosSalvos(mensagensRef.current);
      const { userId: uid, token } = await sessaoAtual();
      if (!uid || token === '') {
        const e: ErroChat = { tipo: 'sessao', mensagem: 'Sua sessão expirou' };
        const inicial = estadoInicial(pergunta, anteriores);
        setEstado({
          ...inicial,
          status: 'errou',
          erro: e,
          turnos: [
            ...inicial.turnos,
            { id: 'erro:sessao', autor: 'erro', mensagem: e.mensagem, tipo: 'sessao' },
          ],
        });
        optsRef.current?.aoSessaoExpirada?.();
        return;
      }
      ordemRef.current = ordem;
      setEstado(estadoInicial(pergunta, anteriores));
      const resultado = await executarResposta({
        userId: uid,
        pergunta,
        historico: paresDaConversa(mensagensRef.current, PAIRES_CONTEXTO),
        sessionId: id ?? '',
        ordem,
        anteriores,
        token,
        signal: sinal,
        aoEstado: (e) => setEstado(e),
        aoSessaoExpirada: () => optsRef.current?.aoSessaoExpirada?.(),
      });
      if (sinal.aborted) {
        // Stop pressed: the stream died on purpose — keep the partial text,
        // no error, the turn stays pending (P9).
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
        // A successful streamChat is proof of connectivity: clear the
        // offline flag (and trigger the queue replay, if it is pending).
        marcarSucessoRede();
        // The turn is answered: keep the in-memory list (and the cache)
        // in step, so the NEXT question sends the right context and lands
        // on the right ordem.
        mensagensRef.current = [
          ...mensagensRef.current.filter((m) => m.ordem !== ordem),
          {
            ordem,
            pergunta,
            resposta: resultado.texto,
            fontes: resultado.fontes,
          },
        ].sort((a, b) => a.ordem - b.ordem);
        void cachearConversa(uid, id ?? '', mensagensRef.current, linhaRef.current).catch(
          (err) => {
            console.warn('[useChat] cache offline da resposta ignorado:', err);
          },
        );
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
        if (resultado.falhaDeRede) {
          // Offline (the server never answered): park the question in the
          // queue (persisted) and show the HONEST state instead of the
          // generic retry wording — it is replayed in order on
          // connectivity. 4xx/5xx (429/401) never reach here: they
          // answered, so they are not queued.
          void haptics.error();
          await tratarFalhaDeRede(
            uid,
            id ?? '',
            pergunta,
            ordem,
            mensagensRef.current,
          );
          setEstado((atual) => ({
            ...atual,
            status: 'errou',
            erro: { tipo: 'outro', mensagem: MENSAGEM_SEM_CONEXAO },
            turnos: [
              ...atual.turnos,
              {
                id: `erro:offline:${atual.turnos.length}`,
                autor: 'erro',
                mensagem: MENSAGEM_SEM_CONEXAO,
                tipo: 'outro',
              },
            ],
          }));
          return;
        }
        // Everything the server ANSWERED with — 403 closed beta, 429 rate
        // limit, 500, 503 — lands here. It used to stop at the haptic, so
        // the backend's own wording never reached the student: the screen
        // only showed the terse hint under the composer and the answer area
        // stayed blank. It becomes an error turn, so components/chat/bolhas
        // renders it in the same dialog as the offline and session cases,
        // with "Tentar de novo" for the types that can be retried.
        void haptics.error();
        setEstado((atual) => ({
          ...atual,
          status: 'errou',
          erro: resultado.erro,
          turnos: [
            ...atual.turnos,
            {
              id: `erro:${resultado.erro.tipo}:${atual.turnos.length}`,
              autor: 'erro',
              mensagem: resultado.erro.mensagem,
              tipo: resultado.erro.tipo,
            },
          ],
        }));
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
      try {
        linha = await lerConversa(uid, id);
        if (!ativo) return;
        setCarregou(true);
      } catch (err) {
        // A read failure must not blank the conversation: continue without
        // it (the pending seed already on screen keeps it honest).
        console.error('[useChat] lerConversa falhou:', err);
        if (!ativo) return;
        setCarregou(true);
      }

      if (linha === null) {
        // Supabase unreachable, or the conversation was never written: the
        // offline cache is the last-known state and is what the student
        // saw a moment ago.
        try {
          linha = await conversaPorIdOffline(uid, id);
        } catch {
          linha = null;
        }
        if (!ativo) return;
      }

      if (linha) {
        linhaRef.current = linha;
        mensagensRef.current = linha.mensagens;
        setFavorita(linha.favorita);
      }

      const salvas = linha?.mensagens ?? [];
      const pendenteSalva = salvas.find((m) => m.resposta === null) ?? null;

      if (linha && pendenteSalva === null && salvas.length > 0) {
        // Saved, complete conversation: render every turn (the pendente
        // seed, if a stale entry lingered in memory, is replaced by them).
        if (!ativo) return;
        ordemRef.current = salvas[salvas.length - 1].ordem;
        setEstado({
          ...estadoVazio(),
          turnos: turnosSalvos(salvas),
          pergunta: salvas[salvas.length - 1].pergunta,
          concluido: true,
        });
        return;
      }

      const pendente = lerPendente(id);
      // P9: the question is already parked in the offline queue (the home
      // screen sent it while offline): the queue REPLAY owns this
      // conversation — do not start a second stream for the same id.
      try {
        const fila = await filaPendente();
        if (fila.some((i) => i.conversationId === id)) {
          if (!ativo) return;
          setEstado((atual) => ({
            ...atual,
            turnos: [
              ...atual.turnos,
              { id: 'nota:fila', autor: 'nota', texto: MENSAGEM_SEM_CONEXAO },
            ],
          }));
          return;
        }
      } catch {
        // Queue read failed: fall through and start normally (the queue's
        // conversationId de-dup keeps a double-send from piling up).
      }

      // The stream died mid-way last time → re-send that turn; otherwise
      // this is a fresh conversation from the home screen.
      const pergunta = pendenteSalva
        ? pendenteSalva.pergunta
        : pendente
          ? pendente.question
          : null;
      const ordem = pendenteSalva ? pendenteSalva.ordem : salvas.length;

      if (!pergunta || !ativo) return;

      // P9: the pending turn is inserted with resposta = null BEFORE the
      // stream. A duplicate insert (StrictMode's second effect run, or a
      // double-tap) is the unique constraint talking — treat the turn as
      // existing and go on.
      if (!pendenteSalva) {
        try {
          await anexarMensagem(uid, id, { ordem, pergunta });
        } catch (err) {
          console.warn('[useChat] insert do turno pendente ignorado (já existe?):', err);
        }
        if (!linhaRef.current) {
          linhaRef.current = {
            id,
            titulo: pergunta,
            mensagens: [],
            fontes: [],
            pergunta,
            resposta: null,
            criada_em: new Date().toISOString(),
            atualizada_em: new Date().toISOString(),
            favorita: false,
          };
        }
      }
      // The turns before this one are the context and the lines on screen;
      // the pending one is re-drawn by estadoInicial.
      mensagensRef.current = salvas.filter((m) => m.ordem < ordem);
      if (!ativo) return;
      void disparar(pergunta, ordem, controller.signal);
    })();
    return () => {
      ativo = false;
      controller.abort();
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [id, enabled, disparar]);

  // ── send: the composer / "Tentar de novo" ──
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
        // A RETRY answers the turn that is already pending (same ordem, row
        // already inserted); a FOLLOW-UP is the next turn of the same
        // conversation and has to be inserted.
        const respondidas = mensagensRef.current.filter((m) => m.resposta !== null);
        const retomando =
          estado.status === 'errou' && estado.pergunta.trim() === limpo;
        const ordem = retomando ? ordemRef.current : respondidas.length;
        mensagensRef.current = respondidas.filter((m) => m.ordem < ordem);

        if (!retomando) {
          try {
            await anexarMensagem(uid, id, { ordem, pergunta: limpo });
          } catch (err) {
            console.warn('[useChat] insert do turno pendente ignorado (já existe?):', err);
          }
          if (!linhaRef.current) {
            linhaRef.current = {
              id,
              titulo: limpo,
              mensagens: [],
              fontes: [],
              pergunta: limpo,
              resposta: null,
              criada_em: new Date().toISOString(),
              atualizada_em: new Date().toISOString(),
              favorita: false,
            };
          }
        }
        await disparar(limpo, ordem, controller.signal);
      })();
    },
    [id, enabled, disparar, estado.status, estado.pergunta],
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
    ordem: ordemRef.current,
    semConexao: usandoCache(),
    send,
    stop,
  };
}

// ─────────────────────────────────────────────
// The queue replay coordinator (P9)
// ─────────────────────────────────────────────

/** Re-entrancy guard: one replay at a time. */
let reprocessandoFila = false;

/**
 * The conversation a queued item belongs to, from the server or — when the
 * server is unreachable — from the offline cache.
 */
async function conversaParaReplay(
  userId: string,
  id: string,
): Promise<Conversa | null> {
  try {
    const doServidor = await lerConversa(userId, id);
    if (doServidor !== null) return doServidor;
  } catch {
    // The radio said "online" but the backend is not: trust the cache.
  }
  try {
    return await conversaPorIdOffline(userId, id);
  } catch {
    return null;
  }
}

/**
 * Drains the offline queue IN ORDER through the same send path a
 * hand-typed question uses (executarResposta): each item is re-sent, its
 * answer persisted (the P9 completion) and cached. The FIRST unanswered
 * item (still offline / 429 / 401 / session loss) goes back to the FRONT
 * of the queue and the replay stops — the next connectivity trigger (an
 * expo-network event or a successful operation) retries from the same
 * point. The UI is out of this path on purpose.
 */
export async function reprocessarFila(): Promise<void> {
  if (reprocessandoFila) return;
  reprocessandoFila = true;
  try {
    for (;;) {
      const item = await queue.dequeue();
      if (!item) break;

      const { userId, token } = await sessaoAtual();
      if (!userId || token === '') {
        // No session (fresh install / expired): nothing can be sent —
        // the item waits at the front, the rest of the queue is untouched.
        await queue.enqueue(item, true);
        break;
      }

      const conversa = await conversaParaReplay(userId, item.conversationId);
      const ordem = item.turno ?? 0;
      const salvas = conversa?.mensagens ?? [];
      // Already answered (the turn completed on another device, or a
      // previous replay got there first): nothing to re-send.
      if (salvas.some((m) => m.ordem === ordem && m.resposta !== null)) continue;
      const anteriores = salvas.filter((m) => m.ordem < ordem && m.resposta !== null);

      const resultado = await executarResposta({
        userId,
        pergunta: item.question,
        historico: paresDaConversa(anteriores, PAIRES_CONTEXTO),
        sessionId: item.conversationId,
        ordem,
        token,
        signal: new AbortController().signal,
        aoEstado: () => undefined,
        // The replay does not redirect to login (no screen is watching).
        aoSessaoExpirada: () => undefined,
      });

      if (resultado.ok) {
        // This success is also the next item's connectivity trigger.
        marcarSucessoRede();
        try {
          await cachearConversa(
            userId,
            item.conversationId,
            [
              ...anteriores,
              {
                ordem,
                pergunta: item.question,
                resposta: resultado.texto,
                fontes: resultado.fontes,
              },
            ],
            conversa,
          );
        } catch (err) {
          console.warn('[useChat] cache offline da resposta reprocessada ignorado:', err);
        }
        continue;
      }

      // Unanswered: back to the FRONT (the order is preserved) and the
      // replay stops here. A network failure re-arms the offline flag so
      // the next successful operation retries the queue.
      if (resultado.falhaDeRede) marcarFalhaRede();
      await queue.enqueue(item, true);
      break;
    }
  } finally {
    reprocessandoFila = false;
  }
}

// The connectivity seam (lib/offline) drives the replay: an expo-network
// offline→online event, or the next successful network operation, calls
// this. The registration is module-level (no UI involved).
registrarReprocessador(() => reprocessarFila());
