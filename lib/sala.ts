/**
 * The ```uspapo-sala``` widget's data: where a discipline's classes are (GET /api/sala, from
 * USPolis): each turma's slots with room and building, and where each building is. The map is the
 * bundled campus base (lib/mapa); only the buildings come from the backend.
 */
import type { Dia } from './grade';
import { enquadrar, projetar, type Ponto } from './mapa';
import { buscarDadosDoWidget } from './widgets';

export type HorarioDaSala = { dia: Dia | null; inicio: string; fim: string; sala: string | null; predio: string | null };
export type TurmaDaSala = { codigo: string; professores: string[]; horarios: HorarioDaSala[] };
export type DadosDaSala = {
  sigla: string; nome: string; periodo: string; turmas: TurmaDaSala[];
  predios: Record<string, { lat: number; lon: number }>;
};

export function buscarSala(campos: Record<string, string>): Promise<DadosDaSala | null> {
  return buscarDadosDoWidget<DadosDaSala>('/api/sala', `sigla=${encodeURIComponent(campos.sigla ?? '')}`);
}

/** A building on the map: its name, where it is (the base layer's meters) and the rooms used there. */
export type PredioNoMapa = { nome: string; ponto: Ponto; salas: string[] };

/** The buildings a turma uses, in the order its classes first meet in each. */
export function prediosDaTurma(dados: DadosDaSala, turma: TurmaDaSala): PredioNoMapa[] {
  const predios = new Map<string, PredioNoMapa>();
  for (const h of turma.horarios) {
    const lugar = h.predio ? dados.predios[h.predio] : undefined;
    if (!h.predio || !h.sala || !lugar) continue;
    const predio = predios.get(h.predio) ?? { nome: h.predio, ponto: projetar([lugar.lat, lugar.lon]), salas: [] };
    if (!predio.salas.includes(h.sala)) predio.salas.push(h.sala);
    predios.set(h.predio, predio);
  }
  return [...predios.values()];
}

/**
 * The viewBox around the buildings: wide enough (500 m at least) to show the streets and the
 * neighboring buildings a student finds the way by.
 */
export function enquadrarPredios(predios: PredioNoMapa[], aspecto: number): [number, number, number, number] {
  return enquadrar(predios.map((p) => p.ponto), aspecto, 500);
}

/** '10:10–11:50'. */
export const faixaDe = (h: HorarioDaSala) => (h.inicio && h.fim ? `${h.inicio}–${h.fim}` : h.inicio || h.fim);
