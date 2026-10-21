/**
 * The ```uspapo-avaliacao``` widget's data: a professor's grades on USP Avalia (GET /api/avaliacao),
 * a site run by students, not an official source. Each graded course comes with its five quesitos
 * (0 to 10, mean and spread); Dificuldade measures how demanding the course is, not a flaw.
 */
import { buscarDadosDoWidget } from './widgets';

export type Quesito = { nome: string; media: number; desvio: number | null; votos: number };
export type DisciplinaAvaliada = { ficha: number; nome: string; nota: number; votos: number | null; comentarios: number; quesitos: Quesito[] };
export type DadosDaAvaliacao = { id: number; nome: string; unidade: string; disciplinas: DisciplinaAvaliada[]; sem_avaliacao: number; fonte: string };

export function buscarAvaliacao(campos: Record<string, string>): Promise<DadosDaAvaliacao | null> {
  return buscarDadosDoWidget<DadosDaAvaliacao>('/api/avaliacao', `professor=${encodeURIComponent(campos.professor ?? '')}`);
}

export const DIFICULDADE = 'Dificuldade';

/** The course shown first: the one the answer was about (`ficha`), else the most voted. */
export function fichaInicial(dados: DadosDaAvaliacao, ficha?: string): number | null {
  const pedida = Number(ficha);
  if (pedida && dados.disciplinas.some((d) => d.ficha === pedida)) return pedida;
  return dados.disciplinas[0]?.ficha ?? null;
}

/** 'Introdução à Computação - MAC2166' -> ['Introdução à Computação', 'MAC2166']. */
export function separarSigla(nome: string): [string, string] {
  const achado = /^(.*?)\s+-\s+([A-Z0-9]{3}\d{4})$/.exec(nome.trim());
  return achado ? [achado[1], achado[2]] : [nome.trim(), ''];
}

/** '6,0' (Portuguese decimals). */
export const nota = (n: number) => n.toFixed(1).replace('.', ',');

/** A mean from one or two votes says little. */
export const fragil = (votos: number | null) => votos !== null && votos <= 2;
