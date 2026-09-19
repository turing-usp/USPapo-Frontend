/**
 * Backend chat client — `POST /api/chat` → SSE event stream.
 *
 * The event union mirrors the backend verbatim (USPapo-Backend,
 * `app/engine/chat.py` + `app/engine/sse.py` — read it for the authoritative
 * contract):
 *
 *     provedor  { name, index }
 *     pensando  { delta }
 *     tool      { state: "start" | "end", index, name, args?, results? }
 *                (index = -1 marks the backend pre-consultation; the wire
 *                key is `results` — the old site's `resultados` is gone)
 *     text      { delta }
 *     sources   { urls }            (sorted; success only)
 *     error     { message }
 *     end       {}
 *
 * Wire format (stable): the first frame is the `: ok` comment ping, then one
 * `data: {json}\n\n` per event (JSON is written with `ensure_ascii=False`,
 * so accented pt-BR crosses the wire as raw UTF-8 — decode with ONE
 * streaming TextDecoder across chunks, never one decode per chunk).
 *
 * Invariants (backend): `sources` + `end` only on success; `error` + `end`
 * on failure.
 *
 * Error model:
 * - no token → throws `Error('Sua sessão expirou')` before any network call
 *   (fast-fail back to login; the message is exactly what
 *   lib/auth.mapAuthError passes through untouched);
 * - non-2xx → the JSON body `{erro, retry_after?}` is parsed (the backend
 *   key is `erro`; `error` is also accepted, and the `retry-after` header is
 *   the fallback) and a `ChatApiError { status, retryAfter }` is thrown.
 *   A 401 maps to the same 'Sua sessão expirou' message;
 * - network failure / abort propagate as-is (TypeError / AbortError) so
 *   mapAuthError can route them to the connection message.
 */
declare const process: { env: Record<string, string | undefined> };

// ─────────────────────────────────────────────
// Event types (the ChatEvent union)
// ─────────────────────────────────────────────

export type ProvedorEvent = { type: 'provedor'; name: string; index: number };

export type PensandoEvent = { type: 'pensando'; delta: string };

export type ToolEvent = {
  type: 'tool';
  state: 'start' | 'end';
  /** Tool-call index; -1 marks the backend pre-consultation. */
  index: number;
  name: string;
  args?: Record<string, unknown>;
  /** Number of source URLs the tool returned (wire key: `results`). */
  results?: number;
};

export type TextEvent = { type: 'text'; delta: string };

export type SourcesEvent = { type: 'sources'; urls: string[] };

export type ErrorEvent = { type: 'error'; message: string };

export type EndEvent = { type: 'end' };

/** One event of the /api/chat SSE stream (the stable backend contract). */
export type ChatEvent =
  | ProvedorEvent
  | PensandoEvent
  | ToolEvent
  | TextEvent
  | SourcesEvent
  | ErrorEvent
  | EndEvent;

// ─────────────────────────────────────────────
// Tool status labels (pt-BR) — ported verbatim from the old site
// ─────────────────────────────────────────────

export const TOOL_LABELS: Record<string, string> = {
  buscar_documentos: 'Consultando documentos da USP',
  jupiter: 'Consultando o Jupiter',
  consultar_circulares: 'Checando os horários',
  consultar_bandejao: 'Checando o cardápio',
  consultar_sala: 'Localizando a sala',
};

/** Friendly pt-BR label for the status pill; unknown tools show their name. */
export function labelDaFerramenta(name: string): string {
  return TOOL_LABELS[name] ?? name;
}

// ─────────────────────────────────────────────
// Backend URL
// ─────────────────────────────────────────────

/**
 * The backend base URL. Mobile points it at the Render service (prod) or the
 * local dev server; the web build goes through the same-origin `/api/*`
 * proxy, so it may set EXPO_PUBLIC_BACKEND_URL accordingly. Trailing slashes
 * are stripped so `backendUrl() + '/api/chat'` never double-slashes.
 */
export function backendUrl(): string {
  const configurado = process.env.EXPO_PUBLIC_BACKEND_URL;
  const base = configurado && configurado.trim() !== '' ? configurado : 'http://127.0.0.1:8000';
  return base.replace(/\/+$/, '');
}

// ─────────────────────────────────────────────
// SSE parsing (incremental)
// ─────────────────────────────────────────────

const EVENT_TYPES: readonly string[] = [
  'provedor',
  'pensando',
  'tool',
  'text',
  'sources',
  'error',
  'end',
];

/**
 * Type guard for the wire JSON: a frame is a ChatEvent only when it is an
 * object with a known `type` and the fields of that shape. Anything else
 * (a corrupt frame, a future event type) is dropped instead of poisoning
 * the stream.
 */
export function isChatEvent(value: unknown): value is ChatEvent {
  if (typeof value !== 'object' || value === null) return false;
  const v = value as Record<string, unknown>;
  const tipo = v.type;
  if (typeof tipo !== 'string' || !EVENT_TYPES.includes(tipo)) return false;
  switch (tipo) {
    case 'provedor':
      return typeof v.name === 'string' && typeof v.index === 'number';
    case 'pensando':
    case 'text':
      return typeof v.delta === 'string';
    case 'tool':
      return (
        (v.state === 'start' || v.state === 'end') &&
        typeof v.index === 'number' &&
        typeof v.name === 'string' &&
        (v.args === undefined || (typeof v.args === 'object' && v.args !== null)) &&
        (v.results === undefined || typeof v.results === 'number')
      );
    case 'sources':
      return Array.isArray(v.urls) && v.urls.every((u) => typeof u === 'string');
    case 'error':
      return typeof v.message === 'string';
    case 'end':
      return true;
    default:
      return false;
  }
}

function parseFrame(quadro: string): ChatEvent[] {
  const eventos: ChatEvent[] = [];
  for (const linha of quadro.split('\n')) {
    // Comments (the `: ok` connection ping, heartbeats): ignored by design.
    if (linha.startsWith(':')) continue;
    // Only `data:` lines carry events in this protocol (`event:`, `id:` and
    // `retry:` are unused by the backend).
    if (!linha.startsWith('data:')) continue;
    const bruto = linha.slice('data:'.length).trim();
    if (bruto === '') continue;
    let parsed: unknown;
    try {
      parsed = JSON.parse(bruto);
    } catch {
      // Malformed frame: lose the event, keep the stream alive (same
      // decision as the old site).
      continue;
    }
    if (isChatEvent(parsed)) eventos.push(parsed);
  }
  return eventos;
}

/**
 * Parses every COMPLETE SSE frame in `text` (a frame ends at a blank line,
 * i.e. the text must end with `\n\n` for the last piece to count). The
 * trailing incomplete piece, if any, is ignored by design: the caller keeps
 * it and feeds it back together with the next chunk — that is exactly what
 * `createSSEFeed` automates. `data:` lines are parsed as JSON, `:` comment
 * lines are ignored, and malformed frames are dropped.
 */
export function parseSSEBlocks(text: string): ChatEvent[] {
  const normalizado = text.replace(/\r\n/g, '\n');
  if (normalizado === '') return [];
  const quadros = normalizado.split('\n\n');
  // Without a terminating blank line the last piece is a half frame.
  const completos = normalizado.endsWith('\n\n') ? quadros : quadros.slice(0, -1);
  const eventos: ChatEvent[] = [];
  for (const quadro of completos) eventos.push(...parseFrame(quadro));
  return eventos;
}

/**
 * Incremental SSE consumer: feed it decoded chunks in arrival order; it
 * yields only the frames that have completed and re-feeds the pending tail
 * on the next `push`. `flush` parses whatever is left at end of stream (the
 * backend always terminates the last frame with a blank line, so this is a
 * safety net, not a normal path).
 */
export type SSEFeed = {
  push(chunk: string): ChatEvent[];
  flush(): ChatEvent[];
};

export function createSSEFeed(): SSEFeed {
  let resto = '';
  return {
    push(chunk: string): ChatEvent[] {
      resto += chunk.replace(/\r\n/g, '\n');
      const corte = resto.lastIndexOf('\n\n');
      if (corte === -1) return []; // nothing complete yet
      const prontos = resto.slice(0, corte + 2);
      resto = resto.slice(corte + 2);
      return parseSSEBlocks(prontos);
    },
    flush(): ChatEvent[] {
      const fim = resto;
      resto = '';
      if (fim === '') return [];
      return parseSSEBlocks(fim + '\n\n');
    },
  };
}

// ─────────────────────────────────────────────
// Errors
// ─────────────────────────────────────────────

/** A /api/chat call that answered with a non-2xx status. */
export class ChatApiError extends Error {
  /** The HTTP status of the failing response (400/401/403/409/413/429/…). */
  readonly status: number;
  /** Seconds to wait before retrying (429); null when the server didn't say. */
  readonly retryAfter: number | null;

  constructor(message: string, status: number, retryAfter: number | null) {
    super(message);
    this.name = 'ChatApiError';
    this.status = status;
    this.retryAfter = retryAfter;
  }
}

const SESSAO_EXPIRADA = 'Sua sessão expirou';
const ERRO_PADRAO = 'Não consegui falar com o USPapo agora. Tente de novo em instantes.';

function lerRetryAfter(corpo: Record<string, unknown>, res: Response): number | null {
  const doCorpo = corpo.retry_after;
  if (typeof doCorpo === 'number' && Number.isFinite(doCorpo)) return doCorpo;
  if (typeof doCorpo === 'string' && /^\d+$/.test(doCorpo.trim())) {
    return Number.parseInt(doCorpo.trim(), 10);
  }
  // Pentest 004/020: the wait travels in the body AND in the header.
  const doHeader = res.headers?.get?.('retry-after');
  if (typeof doHeader === 'string' && /^\d+$/.test(doHeader.trim())) {
    return Number.parseInt(doHeader.trim(), 10);
  }
  return null;
}

async function erroDaResposta(res: Response): Promise<ChatApiError> {
  let corpo: unknown = null;
  try {
    corpo = await res.json();
  } catch {
    corpo = null; // non-JSON body (proxy hiccup): fall back to the generic message
  }
  const obj = (typeof corpo === 'object' && corpo !== null ? corpo : {}) as Record<
    string,
    unknown
  >;
  const bruto =
    typeof obj.erro === 'string' && obj.erro !== ''
      ? obj.erro
      : typeof obj.error === 'string' && obj.error !== ''
        ? obj.error
        : null;
  // 401 gets the exact message lib/auth.mapAuthError passes through, so the
  // session-expiry fast-fail works no matter what the backend text is.
  const mensagem = res.status === 401 ? SESSAO_EXPIRADA : bruto ?? ERRO_PADRAO;
  return new ChatApiError(mensagem, res.status, lerRetryAfter(obj, res));
}

// ─────────────────────────────────────────────
// streamChat
// ─────────────────────────────────────────────

export type ChatRequest = {
  /** The question (pt-BR, as the student typed it). */
  question: string;
  /**
   * Previous turns as context, oldest first — the wire pairs
   * `{pergunta, resposta}` (pending turns with resposta null are skipped;
   * the backend prunes by its own token budget anyway).
   */
  history?: { pergunta: string; resposta: string }[];
  /** Conversation uuid; travels to the backend as `session_id`. */
  sessionId?: string;
  /** The Supabase access token (Authorization: Bearer). Required. */
  token: string;
  /** Aborts the in-flight stream (the chat Stop button). */
  signal?: AbortSignal;
};

/**
 * Sends the question to `POST /api/chat` and yields the SSE events as they
 * arrive: `provedor` → `pensando` → `tool` start/end → `text` deltas →
 * `sources` → `end` (success) or `error` → `end` (failure).
 *
 * - Throws `ChatApiError` (status + retryAfter) on non-2xx;
 * - Throws `Error('Sua sessão expirou')` when there is no token (no
 *   wasted rate-limit slot) or the server answers 401;
 * - Propagates network failures / aborts as-is.
 */
export async function* streamChat(request: ChatRequest): AsyncGenerator<ChatEvent, void, unknown> {
  if (request.token === '') {
    throw new Error(SESSAO_EXPIRADA);
  }

  const corpo = {
    pergunta: request.question,
    // SSE explicitly: the legacy JSON mode exists for parity, but the app
    // always streams.
    stream: true,
    ...(request.history !== undefined && request.history.length > 0
      ? { historico: request.history }
      : {}),
    ...(request.sessionId ? { session_id: request.sessionId } : {}),
  };

  let res: Response;
  try {
    res = await fetch(`${backendUrl()}/api/chat`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${request.token}`,
      },
      body: JSON.stringify(corpo),
      signal: request.signal,
    });
  } catch (err) {
    // Network down or the user pressed Stop before the headers arrived:
    // let the caller (useChat / mapAuthError) decide what to show.
    throw err;
  }

  if (!res.ok) {
    throw await erroDaResposta(res);
  }

  const tipoConteudo = res.headers?.get?.('content-type') ?? '';
  if (!tipoConteudo.includes('text/event-stream')) {
    // Non-stream fallback: legacy JSON {resposta, fontes}. Yields the same
    // event sequence the UI already knows.
    const dados = (await res.json().catch(() => null)) as {
      resposta?: string;
      fontes?: string[];
    } | null;
    if (dados && typeof dados.resposta === 'string' && dados.resposta !== '') {
      yield { type: 'text', delta: dados.resposta };
    }
    yield { type: 'sources', urls: Array.isArray(dados?.fontes) ? dados.fontes : [] };
    yield { type: 'end' };
    return;
  }

  const body = res.body;
  if (!body) {
    throw new Error(ERRO_PADRAO);
  }

  const leitor = body.getReader();
  const decodificador = new TextDecoder();
  const feed = createSSEFeed();
  try {
    while (true) {
      const { done, value } = await leitor.read();
      if (done) break;
      // ONE streaming decoder: an accented character split across two TCP
      // chunks must NOT become U+FFFD.
      for (const evento of feed.push(decodificador.decode(value, { stream: true }))) {
        yield evento;
      }
    }
    for (const evento of feed.flush()) yield evento;
  } finally {
    try {
      leitor.releaseLock();
    } catch {
      // The reader is already released (abort) — nothing to do.
    }
  }
}
