/**
 * Admin analytics panel — data layer for app/(admin)/analytics.tsx.
 *
 * Fetches `GET /api/analytics/resumo` (USPapo-Backend/app/main.py) and
 * computes the KPIs the panel cards show. The response shape mirrors the
 * backend `metricas.resumo()` output verbatim (USPapo-Backend/
 * app/analytics/metricas.py — read it for the authoritative contract):
 *
 *     { ok: true, data: {
 *         dau, mau, usuarios, tokens, desempenho_provedores, top_usuarios,
 *         serie_temporal,   // 30 daily points: perguntas, latencia_media_ms…
 *         feedback,         // likes/dislikes totals + daily serie + itens
 *         fontes_citadas,   // [{fonte, contagem}] top-N by count
 *         temas_frequentes  // [{tema, contagem}]
 *     } }
 *
 * Admin credential (FIXED): the panel sends the SIGNED-IN USER'S Supabase
 * access token as `Authorization: Bearer`, and the backend authorises it when
 * that account's hardened `Perfis.uspapo_role` is `admin`
 * (USPapo-Backend/app/main.py `analytics_resumo` → `access.is_admin`).
 *
 * It used to send only `X-Admin-Key: <EXPO_PUBLIC_ADMIN_API_KEY>`. That
 * variable is not set in `.env.production` and must not be — an admin API key
 * inlined into a public web bundle is the key published, and the Cloudflare
 * worker forwards headers verbatim rather than injecting one. So the header
 * went out empty, the endpoint answered 403, and the whole panel rendered its
 * "Não consegui carregar as métricas" retry state: the metrics were never
 * broken, they were never asked for with a credential anyone would accept.
 *
 * The key header is still sent when the variable IS set (a self-hosted
 * operator build behind a private proxy), so both doors keep working.
 *
 * Windows: the endpoint reads a fixed 30-day window (JANELA_PADRAO_DIAS)
 * server-side — there is no `dias` query param. The panel's 24h / 7d
 * selector is a client-side slice over `serie_temporal` and
 * `feedback.serie` (both 30 daily points, oldest first); the provider
 * performance KPIs (taxa de sucesso / erros) only exist for the 30-day
 * window and keep that caption.
 *
 * This module is pure (no React, no React Native): the jest tests in
 * tests/admin/ drive it with a mocked global fetch.
 */
declare const process: { env: Record<string, string | undefined> };

import { backendUrl } from '../../lib/api';

// ─────────────────────────────────────────────
// Wire types (mirror of metricas.resumo() — field names are the contract)
// ─────────────────────────────────────────────

/** One daily point of `data.serie_temporal` (30 points, oldest first). */
export type PontoSerie = {
  /** ISO date (YYYY-MM-DD, UTC). */
  data: string;
  usuarios_unicos: number;
  mau: number;
  perguntas: number;
  prompt_tokens: number;
  completion_tokens: number;
  total_tokens: number;
  /** Average latency in ms of the day's completed answers (0 = none). */
  latencia_media_ms: number;
};

/** One entry of `data.desempenho_provedores` (per provider/model, 30d). */
export type DesempenhoProvedor = {
  total_chamadas: number;
  erros: number;
  latencia_media_ms: number;
  /** erros / total_chamadas (0..1). */
  taxa_erro: number;
};

/** One daily point of `data.feedback.serie`. */
export type PontoFeedback = {
  data: string;
  likes: number;
  dislikes: number;
};

/** One row of `data.feedback.itens` (the turn fields stay null: the new
 *  schema dropped the conversations/messages tables). */
export type ItemFeedback = {
  id: string | null;
  tipo: 'like' | 'dislike';
  motivo: string | null;
  comentario: string | null;
  created_at: string | null;
  conversa_id: string | null;
  mensagem_ordem: number | null;
  user_id: string | null;
  titulo_conversa: null;
  pergunta: null;
  resposta: null;
  fontes: null;
};

/** The `data.feedback` block. */
export type BlocoFeedback = {
  total: number;
  likes: number;
  dislikes: number;
  respostas_avaliaveis: number;
  /** likes / total (0..1). */
  taxa_satisfacao: number;
  /** total / respostas_avaliaveis (0..1). */
  cobertura: number;
  por_motivo: Record<string, number>;
  serie: PontoFeedback[];
  itens: ItemFeedback[];
};

/** One entry of `data.fontes_citadas` (top-N by count; ties alphabetical). */
export type FonteCitada = {
  fonte: string;
  contagem: number;
};

/** One entry of `data.temas_frequentes`. */
export type TemaFrequente = {
  tema: string;
  contagem: number;
};

/** One entry of `data.top_usuarios`. */
export type UsuarioTop = {
  user_id: string;
  total_tokens: number;
  perguntas: number;
  ultima_atividade: string | null;
};

export type BaldeTokens = {
  prompt_tokens: number;
  completion_tokens: number;
  total_tokens: number;
};

/** The `data` object of `GET /api/analytics/resumo`. */
export type ResumoDados = {
  dau: number;
  mau: number;
  usuarios: { dau: number; mau: number; razao_dau_mau: number };
  tokens: {
    hoje: BaldeTokens;
    acumulado_30d: BaldeTokens;
    por_provedor: Record<string, BaldeTokens & { chamadas: number }>;
    por_modelo: Record<string, BaldeTokens & { chamadas: number }>;
  };
  desempenho_provedores: Record<string, DesempenhoProvedor>;
  top_usuarios: UsuarioTop[];
  serie_temporal: PontoSerie[];
  feedback: BlocoFeedback;
  fontes_citadas: FonteCitada[];
  temas_frequentes: TemaFrequente[];
};

/** The full JSON body of `GET /api/analytics/resumo`. */
export type ResumoResposta = {
  ok: boolean;
  data: ResumoDados;
};

// ─────────────────────────────────────────────
// Windows
// ─────────────────────────────────────────────

/** Panel window selector (client-side slice of the 30-day series). */
export type Janela = '24h' | '7d' | '30d';

/** How many daily points each window covers (24h = today). */
export const DIAS_POR_JANELA: Record<Janela, number> = {
  '24h': 1,
  '7d': 7,
  '30d': 30,
};

/** pt-BR caption for the cards computed over the selected slice. */
export const ROTULO_JANELA: Record<Janela, string> = {
  '24h': 'últimas 24h',
  '7d': 'últimos 7 dias',
  '30d': 'últimos 30 dias',
};

/** The caption of the KPIs the backend only computes over its 30-day window. */
export const ROTULO_JANELA_SERVICO = 'últimos 30 dias';

// ─────────────────────────────────────────────
// Fetch
// ─────────────────────────────────────────────

const ERRO_GENERICO = 'Não consegui carregar as métricas.';
/** 403: the session is valid, the account simply is not an USPapo admin. */
export const ERRO_SEM_PERMISSAO =
  'Esta conta não tem acesso ao painel. Entre com uma conta de administrador.';

/** A `GET /api/analytics/resumo` call that answered with a non-2xx status. */
export class ResumoApiError extends Error {
  /** The HTTP status of the failing response (403/503/…). */
  readonly status: number;

  constructor(status: number, mensagem: string) {
    super(mensagem);
    this.name = 'ResumoApiError';
    this.status = status;
  }
}

/**
 * The admin key, read at call time from EXPO_PUBLIC_ADMIN_API_KEY. Empty in
 * every build published from this repo — see the module header: a key in a
 * public bundle is a published key. It stays supported for an operator build
 * that sets it behind a private proxy.
 */
export function adminKey(): string {
  const chave = process.env.EXPO_PUBLIC_ADMIN_API_KEY;
  return chave && chave.trim() !== '' ? chave.trim() : '';
}

/**
 * The signed-in user's Supabase access token, or '' when there is none.
 *
 * This is the credential the panel authenticates with: the backend verifies
 * it against the Supabase JWKS and then checks the account's role.
 *
 * The Supabase client is reached with a LAZY require, and that is deliberate:
 * this module is pure (no React, no React Native) so the KPI math can be unit
 * tested without a runtime, and a top-level import of `lib/supabase` would
 * drag AsyncStorage — a native module — into that graph. A plain `require`
 * inside the function rather than `await import()`: Metro treats the former as
 * an ordinary deferred module lookup, while the latter is an async chunk, and
 * a chunk is a thing the single-output web build would have to emit.
 *
 * Any failure to obtain a token is '': the request still goes out, the
 * endpoint answers 403, and the screen renders the honest message.
 */
async function tokenPadrao(): Promise<string> {
  try {
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    const { supabase } = require('../../lib/supabase') as typeof import('../../lib/supabase');
    const { data } = await supabase.auth.getSession();
    return data.session?.access_token ?? '';
  } catch {
    return '';
  }
}

let lerToken: () => Promise<string> = tokenPadrao;

/** Swaps the credential source (tests). Pass nothing to restore the default. */
export function configurarToken(fn?: () => Promise<string>): void {
  lerToken = fn ?? tokenPadrao;
}

/** The token this call will send ('' when there is no session). */
export async function tokenDaSessao(): Promise<string> {
  return lerToken();
}

/**
 * Fetches the analytics summary. Returns the `data` block; throws
 * `ResumoApiError` (status + the backend's pt-BR `erro` message when the
 * body is JSON) on non-2xx and propagates network failures as-is.
 */
export async function carregarResumo(signal?: AbortSignal): Promise<ResumoDados> {
  const cabecalhos: Record<string, string> = {};
  const chave = adminKey();
  if (chave !== '') cabecalhos['X-Admin-Key'] = chave;
  const token = await tokenDaSessao();
  if (token !== '') cabecalhos.Authorization = `Bearer ${token}`;

  const res = await fetch(`${backendUrl()}/api/analytics/resumo`, {
    headers: cabecalhos,
    signal,
  });

  if (!res.ok) {
    let bruto = '';
    try {
      const corpo = (await res.json()) as { erro?: unknown } | null;
      if (typeof corpo?.erro === 'string' && corpo.erro !== '') bruto = corpo.erro;
    } catch {
      // Non-JSON error body (proxy hiccup): the generic message below.
    }
    const padrao = res.status === 403 ? ERRO_SEM_PERMISSAO : ERRO_GENERICO;
    throw new ResumoApiError(res.status, bruto !== '' ? bruto : padrao);
  }

  const corpo = (await res.json().catch(() => null)) as ResumoResposta | null;
  if (
    !corpo ||
    typeof corpo !== 'object' ||
    corpo.ok !== true ||
    typeof corpo.data !== 'object' ||
    corpo.data === null
  ) {
    // 200 with a wrong shape is a contract violation: treat it as an error,
    // never as an empty panel.
    throw new ResumoApiError(res.status, ERRO_GENERICO);
  }
  return corpo.data;
}

// ─────────────────────────────────────────────
// KPIs
// ─────────────────────────────────────────────

export type Kpis = {
  /** Average questions per day over the window (the "perguntas/dia" KPI). */
  perguntasPorDia: number;
  /** Latency in ms weighted by the day's questions (0 when no questions). */
  tempoMedioMs: number;
  /** 0..1 — 1 − erros/chamadas over the backend's 30-day performance. */
  taxaSucesso: number;
  /** Error count over the backend's 30-day performance. */
  erros: number;
  /** Likes over the window (feedback daily serie slice). */
  likes: number;
  /** Dislikes over the window (feedback daily serie slice). */
  dislikes: number;
};

function fatiaFinal<T>(serie: readonly T[], dias: number): T[] {
  if (serie.length === 0) return [];
  const n = Math.min(dias, serie.length);
  return serie.slice(serie.length - n);
}

/**
 * The six numeric KPI cards for the selected window.
 *
 * - perguntas/dia, tempo médio and likes/dislikes are computed over the
 *   slice of the 30-day daily series (the backend window is fixed at 30
 *   days server-side, so the slice is the only "window" the web can offer);
 * - taxa de sucesso and erros come from `desempenho_provedores`, which the
 *   backend only computes over the 30-day window;
 * - empty data yields zeros, never NaN.
 */
export function kpisDaJanela(dados: ResumoDados, janela: Janela): Kpis {
  const dias = DIAS_POR_JANELA[janela];
  const serie = fatiaFinal(dados.serie_temporal ?? [], dias);
  const serieFeedback = fatiaFinal(dados.feedback?.serie ?? [], dias);

  let totalPerguntas = 0;
  let somaPonderadaMs = 0;
  let somaPesos = 0;
  for (const ponto of serie) {
    const perguntas = Number.isFinite(ponto.perguntas) ? ponto.perguntas : 0;
    totalPerguntas += perguntas;
    // Weight the day's average by how many questions measured it: a quiet
    // day with one measured answer must not pull the mean the way an
    // unweighted average would.
    if (perguntas > 0 && ponto.latencia_media_ms > 0) {
      somaPonderadaMs += ponto.latencia_media_ms * perguntas;
      somaPesos += perguntas;
    }
  }
  const perguntasPorDia = serie.length > 0 ? totalPerguntas / serie.length : 0;
  const tempoMedioMs = somaPesos > 0 ? somaPonderadaMs / somaPesos : 0;

  let likes = 0;
  let dislikes = 0;
  for (const ponto of serieFeedback) {
    likes += Number.isFinite(ponto.likes) ? ponto.likes : 0;
    dislikes += Number.isFinite(ponto.dislikes) ? ponto.dislikes : 0;
  }

  let chamadas = 0;
  let erros = 0;
  const desempenho = dados.desempenho_provedores ?? {};
  for (const nome of Object.keys(desempenho)) {
    const grupo = desempenho[nome];
    chamadas += Number.isFinite(grupo?.total_chamadas) ? grupo.total_chamadas : 0;
    erros += Number.isFinite(grupo?.erros) ? grupo.erros : 0;
  }
  const taxaSucesso = chamadas > 0 ? 1 - erros / chamadas : 0;

  return { perguntasPorDia, tempoMedioMs, taxaSucesso, erros, likes, dislikes };
}

// ─────────────────────────────────────────────
// Chart (dependency-free: the bars are plain Views in the screen)
// ─────────────────────────────────────────────

/** One bar of the "perguntas por dia" chart. */
export type Barra = {
  /** ISO date (YYYY-MM-DD). */
  data: string;
  /** dd/MM label under the bar. */
  rotulo: string;
  /** Questions that day (0..max). */
  valor: number;
};

/** dd/MM from an ISO date (string math: no Date/locale surprises). */
export function rotuloDia(iso: string): string {
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(iso);
  return m ? `${m[3]}/${m[2]}` : iso;
}

/**
 * The chart data for the selected window: one bar per day (N bars for N
 * days — a 7d window renders 7 bars, 30d renders 30, 24h renders 1).
 */
export function barrasDePerguntas(dados: ResumoDados, janela: Janela): Barra[] {
  const serie = fatiaFinal(dados.serie_temporal ?? [], DIAS_POR_JANELA[janela]);
  return serie.map((ponto) => ({
    data: ponto.data,
    rotulo: rotuloDia(ponto.data),
    valor: Number.isFinite(ponto.perguntas) ? ponto.perguntas : 0,
  }));
}

// ─────────────────────────────────────────────
// Fontes + palette (the theme's 6-slot colorblind-safe rule)
// ─────────────────────────────────────────────

/** The excess bucket (theme/index.tsx: "beyond six, the excess becomes Outros"). */
export const NOME_OUTROS = 'Outros';

/** A fonte row with its palette color resolved. */
export type FonteColorida = {
  nome: string;
  contagem: number;
  cor: string;
  /** True for the aggregated "Outros" bucket. */
  eOutros: boolean;
};

/**
 * Palette assignment per the theme rule (theme/index.tsx, `chart`): slots
 * are assigned in a FIXED order and never cycled by ranking position — the
 * color identifies the entity. The stable order is the alphabetical sort of
 * the unique source names, independent of the count ranking: the i-th
 * sorted source takes the i-th palette slot (i < 6). Sources beyond the
 * sixth are collapsed into ONE "Outros" bucket (neutral color), appended at
 * the end of the returned list (the ranked entries keep the input order).
 */
export function coresDeFontes(
  fontes: readonly FonteCitada[],
  paleta: readonly string[],
  neutro: string,
): FonteColorida[] {
  const nomes = [...new Set(fontes.map((f) => f.fonte))].sort();
  const corPorNome = new Map<string, string>();
  nomes.forEach((nome, i) => {
    corPorNome.set(nome, i < paleta.length ? paleta[i] : neutro);
  });

  const linhas: FonteColorida[] = [];
  let totalOutros = 0;
  for (const fonte of fontes) {
    const cor = corPorNome.get(fonte.fonte) ?? neutro;
    if (cor === neutro) {
      totalOutros += fonte.contagem;
    } else {
      linhas.push({
        nome: fonte.fonte,
        contagem: fonte.contagem,
        cor,
        eOutros: false,
      });
    }
  }
  if (totalOutros > 0) {
    linhas.push({ nome: NOME_OUTROS, contagem: totalOutros, cor: neutro, eOutros: true });
  }
  return linhas;
}

// ─────────────────────────────────────────────
// pt-BR formatting (locale-implementation independent: no Intl)
// ─────────────────────────────────────────────

/**
 * pt-BR number (thousands ".", decimal ","), `casas` fraction digits; a
 * trailing ",0" is dropped. Non-finite input renders as "0" — the empty
 * state must read zero, never NaN.
 */
export function formataNumero(valor: number, casas = 0): string {
  if (!Number.isFinite(valor)) return '0';
  const sinal = valor < 0 ? '-' : '';
  const fator = 10 ** casas;
  const arredondado = Math.round(Math.abs(valor) * fator) / fator;
  const [inteira, fracao] = arredondado.toFixed(casas).split('.');
  const comMilhar = inteira.replace(/\B(?=(\d{3})+(?!\d))/g, '.');
  return casas > 0 && fracao !== undefined && fracao !== '0'
    ? `${sinal}${comMilhar},${fracao}`
    : `${sinal}${comMilhar}`;
}

/** 0..1 ratio → "98%" (empty data → "0%"). */
export function formataPorcentagem(ratio: number): string {
  return `${formataNumero(Math.round(Number.isFinite(ratio) ? ratio * 100 : 0))}%`;
}

/** ms → "1.234 ms" (empty data → "0 ms"). */
export function formataMs(ms: number): string {
  return `${formataNumero(Math.round(Number.isFinite(ms) ? ms : 0))} ms`;
}
