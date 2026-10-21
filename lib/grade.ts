/**
 * The ```uspapo-grade``` widget's data and layout. The answer carries only which turmas
 * (`turmas=MAC0110:2026247,MAT2454:2026203`); GET /api/grade returns their weekly schedules, and
 * `montarQuadro` lays them out as a timetable: a column per weekday (Saturday only when used), time
 * running down in proportion, long empty stretches folded into a thin band, and overlapping classes
 * side by side (a clash). No React Native here, so the tests cover the layout.
 */
import { buscarDadosDoWidget } from './widgets';

export type Dia = 'seg' | 'ter' | 'qua' | 'qui' | 'sex' | 'sab' | 'dom';
export type Horario = { dia: Dia; inicio: string; fim: string };
export type TurmaDaGrade = { sigla: string; nome: string; turma: string; tipo: string; professores: string[]; horarios: Horario[] };
/** What the backend sends: each chosen turma still published, and the term it belongs to. */
export type DadosDaGrade = { periodo: { inicio: string; fim: string } | null; turmas: TurmaDaGrade[] };

/** The schedules behind a reference, or null when none of its turmas is published any more. */
export function buscarGrade(campos: Record<string, string>): Promise<DadosDaGrade | null> {
  return buscarDadosDoWidget<DadosDaGrade>('/api/grade', `turmas=${encodeURIComponent(campos.turmas ?? '')}`);
}

const ORDEM: Dia[] = ['seg', 'ter', 'qua', 'qui', 'sex', 'sab', 'dom'];
export const NOME_DO_DIA: Record<Dia, string> = { seg: 'Seg', ter: 'Ter', qua: 'Qua', qui: 'Qui', sex: 'Sex', sab: 'Sáb', dom: 'Dom' };
export const DIA_POR_EXTENSO: Record<Dia, string> = {
  seg: 'segunda', ter: 'terça', qua: 'quarta', qui: 'quinta', sex: 'sexta', sab: 'sábado', dom: 'domingo',
};

/** 'na segunda', 'no sábado'. */
export const naNo = (dia: Dia) => (dia === 'sab' || dia === 'dom' ? 'no' : 'na');

const minutos = (hhmm: string) => {
  const [h, m] = hhmm.split(':').map(Number);
  return h * 60 + m;
};
export const hora = (minuto: number) => `${String(Math.floor(minuto / 60)).padStart(2, '0')}:${String(minuto % 60).padStart(2, '0')}`;

/** 2026247 -> 'T47', as JupiterWeb's own timetable writes it (year, term, then the turma's number). */
export function rotuloDaTurma(codigo: string): string {
  return /^\d{5,}$/.test(codigo) ? `T${Number(codigo.slice(-2))}` : `T${codigo}`;
}

/** 'T2', 'T2 e T3', 'T1, T2 e T4'. */
export function rotuloDasTurmas(codigos: string[]): string {
  const rotulos = codigos.map(rotuloDaTurma);
  return rotulos.length > 1 ? `${rotulos.slice(0, -1).join(', ')} e ${rotulos.at(-1)}` : rotulos.join('');
}

/** 740 -> '12h20', 720 -> '12h'. */
export function duracao(total: number): string {
  const resto = total % 60;
  return `${Math.floor(total / 60)}h${resto ? String(resto).padStart(2, '0') : ''}`;
}

/** One block: a slot of a discipline. Two turmas of it at the very same slot share the block ('T2 e T3'). */
export type Aula = {
  dia: Dia; inicio: number; fim: number; sigla: string; turmas: string[];
  /** The discipline's index: its color. */
  cor: number;
  /** Its lane among the blocks it overlaps, and how many lanes they take. */
  faixa: number; faixas: number;
  choque: boolean;
};
export type Disciplina = { sigla: string; nome: string; cor: number; turmas: TurmaDaGrade[] };
export type Choque = { dia: Dia; inicio: number; fim: number; siglas: [string, string] };
/** A time written on the axis, at its height. */
export type Marca = { minuto: number; y: number };
export type Quadro = {
  dias: Dia[]; disciplinas: Disciplina[]; aulas: Aula[]; choques: Choque[];
  marcas: Marca[];
  /** The folded empty stretches. */
  pausas: { y: number; altura: number }[];
  altura: number;
  /** Height of a minute of the day (piecewise: folded stretches are short). */
  y: (minuto: number) => number;
  minutosSemanais: number;
};

/**
 * Pixels per minute (42 per hour: a 50-minute class still fits two lines), the folded band, the
 * margin above and below, the shortest empty stretch worth folding, and how close two times on
 * the axis may be (starts win over ends).
 */
export const ESCALA = { pxPorMinuto: 0.7, pausa: 14, folga: 8, pausaMinima: 90, distanciaMarcas: 14 };

export function montarQuadro(dados: DadosDaGrade, escala = ESCALA): Quadro {
  const disciplinas: Disciplina[] = [];
  for (const turma of dados.turmas) {
    let disciplina = disciplinas.find((d) => d.sigla === turma.sigla);
    if (!disciplina) disciplinas.push(disciplina = { sigla: turma.sigla, nome: turma.nome, cor: disciplinas.length, turmas: [] });
    disciplina.turmas.push(turma);
  }

  const aulas: Aula[] = [];
  for (const disciplina of disciplinas) {
    for (const turma of disciplina.turmas) {
      for (const h of turma.horarios) {
        const [inicio, fim] = [minutos(h.inicio), minutos(h.fim)];
        if (!ORDEM.includes(h.dia) || !(fim > inicio)) continue;
        const mesma = aulas.find((a) => a.sigla === disciplina.sigla && a.dia === h.dia && a.inicio === inicio && a.fim === fim);
        if (mesma) {
          if (!mesma.turmas.includes(turma.turma)) mesma.turmas.push(turma.turma);
          continue;
        }
        aulas.push({ dia: h.dia, inicio, fim, sigla: disciplina.sigla, turmas: [turma.turma], cor: disciplina.cor, faixa: 0, faixas: 1, choque: false });
      }
    }
  }
  const dias = ORDEM.filter((d, i) => i < 5 || aulas.some((a) => a.dia === d));

  // Lanes: each block takes the first lane free at its start; a group of overlapping blocks splits the column.
  const choques: Choque[] = [];
  for (const dia of dias) {
    const doDia = aulas.filter((a) => a.dia === dia).sort((a, b) => a.inicio - b.inicio || b.fim - a.fim);
    let grupo: Aula[] = [];
    let fimDoGrupo = -1;
    const fechar = () => {
      const faixas = Math.max(...grupo.map((a) => a.faixa)) + 1;
      for (const a of grupo) a.faixas = faixas;
    };
    for (const aula of doDia) {
      if (grupo.length && aula.inicio >= fimDoGrupo) {
        fechar();
        grupo = [];
      }
      const abertas = grupo.filter((a) => a.fim > aula.inicio);
      const ocupadas = new Set(abertas.map((a) => a.faixa));
      while (ocupadas.has(aula.faixa)) aula.faixa++;
      for (const outra of abertas) {
        outra.choque = aula.choque = true;
        choques.push({ dia, inicio: aula.inicio, fim: Math.min(aula.fim, outra.fim), siglas: [outra.sigla, aula.sigla] });
      }
      grupo.push(aula);
      fimDoGrupo = Math.max(fimDoGrupo, aula.fim);
    }
    if (grupo.length) fechar();
  }

  // The time axis: the occupied stretches of the week in proportion; a long empty one folds into a band.
  const trechos: [number, number][] = [];
  for (const a of [...aulas].sort((x, z) => x.inicio - z.inicio)) {
    const ultimo = trechos.at(-1);
    if (ultimo && a.inicio <= ultimo[1]) ultimo[1] = Math.max(ultimo[1], a.fim);
    else trechos.push([a.inicio, a.fim]);
  }
  const segmentos: { de: number; ate: number; y: number; px: number }[] = [];
  const pausas: Quadro['pausas'] = [];
  let altura = escala.folga;
  trechos.forEach(([de, ate], i) => {
    if (i > 0) {
      const antes = trechos[i - 1][1];
      const vao = de - antes;
      const dobra = vao >= escala.pausaMinima;
      const tamanho = dobra ? escala.pausa : vao * escala.pxPorMinuto;
      if (dobra) pausas.push({ y: altura, altura: tamanho });
      segmentos.push({ de: antes, ate: de, y: altura, px: tamanho / vao });
      altura += tamanho;
    }
    segmentos.push({ de, ate, y: altura, px: escala.pxPorMinuto });
    altura += (ate - de) * escala.pxPorMinuto;
  });
  altura += escala.folga;
  const y = (minuto: number) => {
    const s = segmentos.find((seg) => minuto <= seg.ate) ?? segmentos.at(-1);
    return s ? s.y + (Math.min(Math.max(minuto, s.de), s.ate) - s.de) * s.px : 0;
  };

  const inicios = [...new Set(aulas.map((a) => a.inicio))].sort((a, b) => a - b);
  const fins = [...new Set(aulas.map((a) => a.fim))].filter((m) => !inicios.includes(m)).sort((a, b) => a - b);
  const marcas: Marca[] = [];
  for (const minuto of [...inicios, ...fins]) {
    const topo = y(minuto);
    if (marcas.every((m) => Math.abs(m.y - topo) >= escala.distanciaMarcas)) marcas.push({ minuto, y: topo });
  }
  marcas.sort((a, b) => a.minuto - b.minuto);

  return {
    dias, disciplinas, aulas, choques, marcas, pausas, altura: segmentos.length ? altura : 0, y,
    minutosSemanais: aulas.reduce((total, a) => total + a.fim - a.inicio, 0),
  };
}

/** The timetable in words, for screen readers. */
export function descreverQuadro(quadro: Quadro): string {
  const faixa = (dia: Dia, inicio: number, fim: number) => `${DIA_POR_EXTENSO[dia]} das ${hora(inicio)} às ${hora(fim)}`;
  const partes = quadro.disciplinas.map((d) => {
    const aulas = quadro.aulas.filter((a) => a.sigla === d.sigla).sort((a, b) => ORDEM.indexOf(a.dia) - ORDEM.indexOf(b.dia) || a.inicio - b.inicio);
    return `${d.sigla} ${d.nome}, ${rotuloDasTurmas(d.turmas.map((t) => t.turma))}: ${aulas.map((a) => faixa(a.dia, a.inicio, a.fim)).join(', ')}`;
  });
  const choques = quadro.choques.map((c) => `choque entre ${c.siglas[0]} e ${c.siglas[1]} ${naNo(c.dia)} ${faixa(c.dia, c.inicio, c.fim)}`);
  return `Grade horária. ${[...partes, ...choques].join('. ')}.`;
}
