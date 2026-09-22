/**
 * Backend client: `POST /api/chat` as a Server-Sent Events stream, plus the admin summary.
 *
 * Wire: a `: ok` ping, then one `data: {json}` frame per event (see the backend's
 * app/engine/chat.py for the contract). The production web build calls the same-origin
 * `/api` (vercel.json rewrites it; the CSP only allows `connect-src 'self'`); native and
 * the dev server call EXPO_PUBLIC_BACKEND_URL.
 * `expo/fetch` is used because React Native's own fetch has no streaming body.
 */
import { fetch } from 'expo/fetch';
import { Platform } from 'react-native';

declare const process: { env: Record<string, string | undefined> };

export type ChatEvent =
  | { type: 'provedor'; name: string; index: number }
  | { type: 'pensando' }
  | { type: 'tool'; state: 'start' | 'end'; index: number; name: string; args?: Record<string, unknown>; results?: number }
  | { type: 'text'; delta: string }
  | { type: 'sources'; urls: string[] }
  | { type: 'error'; message: string }
  | { type: 'end' };

/** pt-BR label and what the tool consults, per backend tool name. */
export const FERRAMENTAS: Record<string, [string, string]> = {
  buscar_documentos: ['Pesquisando nos documentos', 'Busca nos documentos oficiais da USP indexados pelo USPapo.'],
  consultar_bandejao: ['Consultando cardápio', 'Lê o cardápio publicado pelo RUCard.'],
  consultar_grade_curricular: ['Consultando grade curricular', 'Lê a grade curricular do curso no JupiterWeb.'],
  consultar_turmas: ['Consultando turmas', 'Lê as turmas e os horários da disciplina no JupiterWeb.'],
  buscar_disciplina: ['Buscando disciplina', 'Lê a ementa, os créditos e os requisitos da disciplina no JupiterWeb.'],
  consultar_avaliacoes_professor: ['Buscando avaliações do professor', 'Lê as avaliações de professores publicadas no USP Avalia.'],
  consultar_sala: ['Procurando a sala', 'Localiza a sala e o prédio pelo USPolis.'],
  consultar_circulares: ['Consultando a SPTrans', 'Consulta o GTFS oficial e o Olho Vivo da SPTrans para itinerários, paradas e horários.'],
  consultar_wikipedia: ['Consultando a Wikipédia', 'Lê o resumo do verbete na Wikipédia.'],
};

export function ferramenta(name: string): { rotulo: string; descricao: string } {
  const [rotulo, descricao] = FERRAMENTAS[name] ?? ['Usando ferramenta', 'Consultando uma fonte oficial da USP.'];
  return { rotulo, descricao };
}

export function backendUrl(): string {
  if (Platform.OS === 'web' && !__DEV__) return '';
  return (process.env.EXPO_PUBLIC_BACKEND_URL || 'http://127.0.0.1:8000').replace(/\/+$/, '');
}

export const SESSAO_EXPIRADA = 'Sua sessão expirou';

export class ApiError extends Error {
  constructor(message: string, readonly status: number, readonly retryAfter: number | null) {
    super(message);
    this.name = 'ApiError';
  }
}

async function erroDaResposta(res: Response): Promise<ApiError> {
  const corpo = (await res.json().catch(() => null)) as { erro?: unknown; retry_after?: unknown } | null;
  const header = Number(res.headers.get('retry-after'));
  const espera = typeof corpo?.retry_after === 'number' ? corpo.retry_after : Number.isFinite(header) && header > 0 ? header : null;
  const mensagem = res.status === 401 ? SESSAO_EXPIRADA
    : typeof corpo?.erro === 'string' && corpo.erro ? corpo.erro
      : 'Não consegui falar com o USPapo agora. Tente de novo em instantes.';
  return new ApiError(mensagem, res.status, espera);
}

const TIPOS = new Set(['provedor', 'pensando', 'tool', 'text', 'sources', 'error', 'end']);

/** The complete frames in `buffer`; returns [events, leftover]. Malformed or unknown frames are dropped. */
export function lerFrames(buffer: string): [ChatEvent[], string] {
  const normalizado = buffer.replace(/\r\n/g, '\n');
  const corte = normalizado.lastIndexOf('\n\n');
  if (corte < 0) return [[], normalizado];
  const eventos: ChatEvent[] = [];
  for (const linha of normalizado.slice(0, corte).split('\n')) {
    if (!linha.startsWith('data:')) continue;
    try {
      const evento = JSON.parse(linha.slice(5).trim());
      if (evento && TIPOS.has(evento.type)) eventos.push(evento as ChatEvent);
    } catch {
      // a corrupt frame costs one event, not the stream
    }
  }
  return [eventos, normalizado.slice(corte + 2)];
}

export type ChatRequest = {
  question: string;
  history?: { pergunta: string; resposta: string }[];
  sessionId?: string;
  token: string;
  signal?: AbortSignal;
};

/** Streams the chat events. Throws ApiError on non-2xx and propagates network errors/aborts. */
export async function* streamChat(req: ChatRequest): AsyncGenerator<ChatEvent> {
  if (!req.token) throw new ApiError(SESSAO_EXPIRADA, 401, null);
  const res = await fetch(`${backendUrl()}/api/chat`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${req.token}` },
    body: JSON.stringify({
      pergunta: req.question,
      ...(req.history?.length ? { historico: req.history } : {}),
      ...(req.sessionId ? { session_id: req.sessionId } : {}),
    }),
    signal: req.signal,
  });
  if (!res.ok) throw await erroDaResposta(res as unknown as Response);
  const leitor = res.body?.getReader();
  if (!leitor) throw new ApiError('A resposta chegou vazia.', 502, null);
  const decodificador = new TextDecoder(); // one streaming decoder: accents may split across chunks
  let resto = '';
  try {
    for (;;) {
      const { done, value } = await leitor.read();
      if (done) break;
      const [eventos, sobra] = lerFrames(resto + decodificador.decode(value, { stream: true }));
      resto = sobra;
      yield* eventos;
    }
    yield* lerFrames(resto + '\n\n')[0];
  } finally {
    leitor.releaseLock?.();
  }
}

/** GET an admin JSON endpoint with the user's session token. */
export async function getAdmin<T>(caminho: string, token: string, signal?: AbortSignal): Promise<T> {
  const res = await fetch(`${backendUrl()}${caminho}`, { headers: { Authorization: `Bearer ${token}` }, signal });
  if (!res.ok) throw await erroDaResposta(res as unknown as Response);
  return (await res.json()) as T;
}
