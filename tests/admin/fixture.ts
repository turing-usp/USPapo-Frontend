/**
 * Fixture for the tests/admin/ suites: a full `GET /api/analytics/resumo`
 * body built with the EXACT field names of the backend
 * (USPapo-Backend/app/analytics/metricas.py `resumo()` output — 30 daily
 * points oldest-first, feedback serie, desempenho_provedores per provider,
 * fontes_citadas top-N by count).
 *
 * The patterns are deterministic by design so the expected KPI values in
 * the tests are hand-computable:
 *
 *   serie_temporal (30 days ending 2026-09-19):
 *     perguntas[d]        = (d % 4) + 1        (d = days before today)
 *     latencia_media_ms[d] = 800 + d
 *   → last 7 days (d = 6..0): perguntas [3,2,1,4,3,2,1], sum 16, mean 16/7
 *     weighted latency = (806·3+805·2+804·1+803·4+802·3+801·2+800·1)/16
 *                       = 12852/16 = 803.25
 *   → last 1 day (d = 0): perguntas [1], latency 800
 *
 *   feedback.serie: likes on even d (6,4,2,0 → 4 in 7d; 1 in 24h),
 *   dislikes = 2 on d = 3 (2 in 7d; 0 in 24h).
 *
 *   desempenho_provedores: groq 100 calls / 2 errors + openai 50 / 1
 *   → 150 calls, 3 errors → taxa de sucesso = 1 − 3/150 = 0.98
 *
 *   fontes_citadas: 7 sources. Count order ≠ alphabetical order, so the
 *   palette test proves the slot is entity-stable (alphabetical), not
 *   rank-based: alphabetical order is
 *     bandejao.com, ciencia.usp.br, jupiter.usp.br, portal.usp.br,
 *     reitoria.usp.br, usp.br, www.usp.br → www.usp.br (the 7th) must
 *     become "Outros" even though it has the HIGHEST count (9).
 */
import type {
  PontoFeedback,
  PontoSerie,
  ResumoDados,
  ResumoResposta,
} from '../../app/(admin)/metricas';

/** The fixture's "today" (UTC). */
export const AGORA_ISO = '2026-09-19';

/** ISO date `diasAtras` days before AGORA_ISO. */
export function dataDia(diasAtras: number): string {
  return new Date(Date.UTC(2026, 8, 19) - diasAtras * 86400000).toISOString().slice(0, 10);
}

/** The 30-point daily series (oldest first), per the patterns above. */
export const SERIE: PontoSerie[] = Array.from({ length: 30 }, (_, i) => {
  const diasAtras = 29 - i;
  return {
    data: dataDia(diasAtras),
    usuarios_unicos: 10 + i,
    mau: 100,
    perguntas: (diasAtras % 4) + 1,
    prompt_tokens: 1000,
    completion_tokens: 500,
    total_tokens: 1500,
    latencia_media_ms: 800 + diasAtras,
  };
});

/** The 30-point feedback daily serie. */
export const SERIE_FEEDBACK: PontoFeedback[] = Array.from({ length: 30 }, (_, i) => {
  const diasAtras = 29 - i;
  return {
    data: dataDia(diasAtras),
    likes: diasAtras % 2 === 0 ? 1 : 0,
    dislikes: diasAtras === 3 ? 2 : 0,
  };
});

/** The `data` block of the resumo endpoint. */
export const DADOS: ResumoDados = {
  dau: 12,
  mau: 100,
  usuarios: { dau: 12, mau: 100, razao_dau_mau: 0.12 },
  tokens: {
    hoje: { prompt_tokens: 10000, completion_tokens: 5000, total_tokens: 15000 },
    acumulado_30d: { prompt_tokens: 300000, completion_tokens: 150000, total_tokens: 450000 },
    por_provedor: {
      groq: { prompt_tokens: 200000, completion_tokens: 100000, total_tokens: 300000, chamadas: 100 },
      openai: { prompt_tokens: 100000, completion_tokens: 50000, total_tokens: 150000, chamadas: 50 },
    },
    por_modelo: {
      llama_3_7: { prompt_tokens: 300000, completion_tokens: 150000, total_tokens: 450000, chamadas: 150 },
    },
  },
  desempenho_provedores: {
    groq: { total_chamadas: 100, erros: 2, latencia_media_ms: 900.5, taxa_erro: 0.02 },
    openai: { total_chamadas: 50, erros: 1, latencia_media_ms: 1500.25, taxa_erro: 0.02 },
  },
  top_usuarios: [
    {
      user_id: 'u-0001',
      total_tokens: 50000,
      perguntas: 20,
      ultima_atividade: '2026-09-19T10:00:00.000Z',
    },
  ],
  serie_temporal: SERIE,
  feedback: {
    total: 6,
    likes: 4,
    dislikes: 2,
    respostas_avaliaveis: 150,
    taxa_satisfacao: 0.6667,
    cobertura: 0.04,
    por_motivo: { 'Resposta longa': 1, 'Não respondeu bem': 1 },
    serie: SERIE_FEEDBACK,
    itens: [
      {
        id: 'fb-0001',
        tipo: 'like',
        motivo: null,
        comentario: null,
        created_at: '2026-09-18T14:32:00.000Z',
        conversa_id: 'conv-0001',
        mensagem_ordem: 1,
        user_id: 'u-0001',
        titulo_conversa: null,
        pergunta: null,
        resposta: null,
        fontes: null,
      },
      {
        id: 'fb-0002',
        tipo: 'dislike',
        motivo: 'Resposta longa',
        comentario: null,
        created_at: '2026-09-15T09:15:00.000Z',
        conversa_id: 'conv-0002',
        mensagem_ordem: 2,
        user_id: 'u-0002',
        titulo_conversa: null,
        pergunta: null,
        resposta: null,
        fontes: null,
      },
    ],
  },
  // Top-N by count (7 entries: the palette "Outros" rule test needs 6+).
  fontes_citadas: [
    { fonte: 'jupiter.usp.br', contagem: 12 },
    { fonte: 'www.usp.br', contagem: 9 },
    { fonte: 'bandejao.com', contagem: 7 },
    { fonte: 'usp.br', contagem: 6 },
    { fonte: 'reitoria.usp.br', contagem: 4 },
    { fonte: 'portal.usp.br', contagem: 3 },
    { fonte: 'ciencia.usp.br', contagem: 2 },
  ],
  temas_frequentes: [
    { tema: 'bandejao', contagem: 4 },
    { tema: 'horas', contagem: 3 },
  ],
};

/** The full endpoint body: `{ ok: true, data: … }`. */
export const RESUMO_RESPOSTA: ResumoResposta = { ok: true, data: DADOS };

/**
 * The all-empty panel: every aggregate zero, every list empty. The screen
 * must render zeros (never NaN) from this.
 */
export const DADOS_VAZIOS: ResumoDados = {
  dau: 0,
  mau: 0,
  usuarios: { dau: 0, mau: 0, razao_dau_mau: 0 },
  tokens: {
    hoje: { prompt_tokens: 0, completion_tokens: 0, total_tokens: 0 },
    acumulado_30d: { prompt_tokens: 0, completion_tokens: 0, total_tokens: 0 },
    por_provedor: {},
    por_modelo: {},
  },
  desempenho_provedores: {},
  top_usuarios: [],
  serie_temporal: [],
  feedback: {
    total: 0,
    likes: 0,
    dislikes: 0,
    respostas_avaliaveis: 0,
    taxa_satisfacao: 0,
    cobertura: 0,
    por_motivo: {},
    serie: [],
    itens: [],
  },
  fontes_citadas: [],
  temas_frequentes: [],
};

/** The light-scheme palette (theme/index.tsx `colors.light.chart`) — the
 *  tests assert slot assignment against these exact hexes. */
export const PALETA_LUZ: string[] = ['#eb6834', '#2a78d6', '#1baf7a', '#4a3aa7', '#eda100', '#e87ba4'];

/** The neutral color the "Outros" bucket uses (theme `mutedForeground`). */
export const NEUTRO_LUZ = '#55618a';
