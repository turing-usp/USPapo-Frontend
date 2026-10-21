/**
 * The ```uspapo-onibus``` widget's data: the next buses at a stop (GET /api/onibus). The answer
 * carries only the lines and the GTFS stops; the backend runs the same chain as a "quando passa?"
 * answer (live Olho Vivo ETAs when it has them, else the schedule). Never cached: the widget asks
 * again on its own clock, and counts the minutes down in between from each arrival's instant.
 */
import { backendUrl } from './api';
import { sessaoAtual } from './auth';

export type Chegada = { instante: string; ao_vivo: boolean; acessivel: boolean | null };
export type SituacaoDaLinha = 'ok' | 'sem_servico' | 'sem_passagem' | 'sem_horario';
export type LinhaNaParada = {
  linha: string; sentido: string; busp: boolean; chegadas: Chegada[];
  /** The scheduled headway right now, when the line runs by frequency. */
  intervalo_min: number | null;
  situacao: SituacaoDaLinha;
};
export type DadosDoOnibus = { parada: string; atualizado_em: string; ao_vivo: boolean; api_falhou: boolean; linhas: LinhaNaParada[] };

/** The next buses, or null when the stop or its lines left the timetable (404). Throws on a failure. */
export async function buscarOnibus(campos: Record<string, string>): Promise<DadosDoOnibus | null> {
  const { token } = await sessaoAtual();
  const consulta = `linhas=${encodeURIComponent(campos.linhas ?? '')}&paradas=${encodeURIComponent(campos.paradas ?? '')}`;
  const res = await fetch(`${backendUrl()}/api/onibus?${consulta}`, { headers: { Authorization: `Bearer ${token}` } });
  if (res.status === 404) return null;
  if (!res.ok) throw new Error(`/api/onibus ${res.status}`);
  return (await res.json()) as DadosDoOnibus;
}

/** Whole minutes from `agora` (ms) until the arrival; 0 once it is due. */
export function minutosAte(instante: string, agora: number): number {
  return Math.max(0, Math.round((Date.parse(instante) - agora) / 60000));
}

/** 'agora', '4 min'. */
export function rotuloDosMinutos(minutos: number): string {
  return minutos <= 0 ? 'agora' : `${minutos} min`;
}

/** '13:47' as São Paulo reads it: the instant carries its own offset (-03:00). */
export function horaDe(instante: string): string {
  return instante.slice(11, 16);
}

/** The arrivals still ahead (a bus due a moment ago stays, as 'agora', for a minute), in order. */
export function aindaPorVir(chegadas: Chegada[], agora: number): Chegada[] {
  return chegadas.filter((c) => Date.parse(c.instante) >= agora - 60_000);
}

/** For screen readers: '8084-10 para Cid. Universitária: em 4 minutos, ao vivo; depois em 12 minutos'. */
export function descreverLinha(l: LinhaNaParada, agora: number): string {
  const chegadas = aindaPorVir(l.chegadas, agora);
  if (!chegadas.length) return `${l.linha} para ${l.sentido}: ${SITUACOES[l.situacao === 'ok' ? 'sem_horario' : l.situacao]}`;
  const partes = chegadas.map((c, i) => {
    const m = minutosAte(c.instante, agora);
    return `${i ? 'depois ' : ''}${m <= 0 ? 'chegando agora' : `em ${m} ${m === 1 ? 'minuto' : 'minutos'}`}${c.ao_vivo ? ', ao vivo' : ', pela programação'}`;
  });
  return `${l.linha} para ${l.sentido}: ${partes.join('; ')}`;
}

export const SITUACOES: Record<Exclude<SituacaoDaLinha, 'ok'>, string> = {
  sem_servico: 'não opera agora',
  sem_passagem: 'não passa mais hoje',
  sem_horario: 'sem horário agora',
};
