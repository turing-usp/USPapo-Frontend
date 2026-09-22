/** Admin summary (`GET /api/analytics/resumo?dias=`), authorized by the signed-in admin's session. */
import { getAdmin } from './api';
import { sessaoAtual } from './auth';

export type Dia = {
  data: string; perguntas: number; usuarios: number; conversas: number; latencia_media_ms: number;
  tokens: number; erros: number; likes: number; dislikes: number;
};
export type ItemFeedback = {
  id: string | null; tipo: 'like' | 'dislike'; motivo: string | null; comentario: string | null; created_at: string | null;
  titulo: string | null; pergunta: string | null; resposta: string | null; fontes: string[]; usuario: string | null;
};
export type Resumo = {
  periodo: { desde: string; ate: string; dias: number };
  kpis: {
    perguntas: number; respondidas: number; pendentes: number; conversas: number; usuarios: number; dau: number; wau: number;
    latencia_media_ms: number; latencia_p95_ms: number; taxa_sucesso: number; erros: number; tokens: number;
    likes: number; dislikes: number; satisfacao: number | null; cobertura: number;
  };
  serie: Dia[];
  provedores: { nome: string; chamadas: number; erros: number; taxa_erro: number; latencia_media_ms: number; tokens: number }[];
  ferramentas: { nome: string; contagem: number }[];
  fontes: { fonte: string; contagem: number }[];
  temas: { tema: string; contagem: number }[];
  top_usuarios: { id: string; nome: string | null; perguntas: number; tokens: number; ultima: string | null }[];
  feedback: { por_motivo: Record<string, number>; itens: ItemFeedback[] };
};

export const JANELAS = [1, 7, 30, 90] as const;

export async function carregarResumo(dias: number, signal?: AbortSignal): Promise<Resumo> {
  const { token } = await sessaoAtual();
  return (await getAdmin<{ data: Resumo }>(`/api/analytics/resumo?dias=${dias}`, token, signal)).data;
}

const compacto = new Intl.NumberFormat('pt-BR', { notation: 'compact', maximumFractionDigits: 1 });
export const numero = (n: number) => (Math.abs(n) >= 10_000 ? compacto.format(n) : n.toLocaleString('pt-BR'));
export const porcento = (x: number | null) => (x == null ? '—' : `${Math.round(x * 100)}%`);
export const duracao = (ms: number) => (ms ? (ms >= 1000 ? `${(ms / 1000).toFixed(1)} s` : `${ms} ms`) : '—');
export const segundos = (ms: number) => `${(ms / 1000).toFixed(ms && ms < 1000 ? 1 : 0)} s`;
export const diaCurto = (iso: string) => `${iso.slice(8, 10)}/${iso.slice(5, 7)}`;
export const dataHora = (iso: string | null) =>
  iso ? new Date(iso).toLocaleString('pt-BR', { dateStyle: 'short', timeStyle: 'short' }) : 'sem data';
