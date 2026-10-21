/**
 * The ```uspapo-curriculo``` widget's data and layout: a course's required disciplines by ideal
 * semester (GET /api/curriculo) and the requirements JupiterWeb lists for that very course
 * (GET /api/curriculo/requisitos, slower: it may come a moment later). Each semester is a row: its
 * number and credits on the left, its disciplines as cards wrapping to the right; with the room, a
 * card also shows the name. Tapping a card draws arrows from what it requires and to what it
 * unlocks. No React Native here, so the tests cover the layout.
 */
import { buscarDadosDoWidget } from './widgets';

export type DisciplinaDoCurriculo = { sigla: string; nome: string; aula: number; trabalho: number; anual: boolean };
export type Semestre = { numero: number; creditos: number; disciplinas: DisciplinaDoCurriculo[] };
export type DadosDoCurriculo = {
  codigo: string; nome: string; unidade: string; duracao: number | null; desde: string | null;
  /** Newer curricula are published a few semesters at a time: up to `ultimo`, so far. */
  parcial: boolean; ultimo: number | null;
  semestres: Semestre[]; optativas: { eletivas: number; livres: number };
};
/** `de` is required by `para`; `alternativa`: one of an 'A ou B' group. */
export type Requisito = { de: string; para: string; tipo: 'forte' | 'fraco' | 'conjunto'; alternativa: boolean };

export function buscarCurriculo(campos: Record<string, string>): Promise<DadosDoCurriculo | null> {
  return buscarDadosDoWidget<DadosDoCurriculo>('/api/curriculo', `curso=${encodeURIComponent(campos.curso ?? '')}`);
}

export function buscarRequisitos(campos: Record<string, string>): Promise<Requisito[] | null> {
  return buscarDadosDoWidget<Requisito[]>('/api/curriculo/requisitos', `curso=${encodeURIComponent(campos.curso ?? '')}`);
}

export type Cartao = DisciplinaDoCurriculo & { semestre: number; x: number; y: number; largura: number; altura: number };
export type LinhaDoSemestre = { numero: number; creditos: number; y: number; altura: number };
export type LayoutDoCurriculo = { cartoes: Cartao[]; semestres: LinhaDoSemestre[]; largura: number; altura: number; comNomes: boolean };

/** The semester column, the gap between cards, and between semesters. */
export const ROTULO = 44;
export const VAO = 6;
export const ENTRE_SEMESTRES = 14;
/** From this card width on there is room for the name under the sigla. */
const LARGURA_COM_NOME = 148;
const MINIMA = 88;
export const ALTURA = { sigla: 42, nome: 66 };

export function montarCurriculo(dados: DadosDoCurriculo, largura: number): LayoutDoCurriculo {
  const util = Math.max(MINIMA * 2 + VAO, largura - ROTULO);
  const colunasComNome = Math.floor((util + VAO) / (LARGURA_COM_NOME + VAO));
  const comNomes = colunasComNome >= 2;
  const colunas = comNomes ? colunasComNome : Math.max(2, Math.floor((util + VAO) / (MINIMA + VAO)));
  const w = (util - (colunas - 1) * VAO) / colunas;
  const h = comNomes ? ALTURA.nome : ALTURA.sigla;
  const cartoes: Cartao[] = [];
  const semestres: LinhaDoSemestre[] = [];
  let y = 0;
  for (const s of dados.semestres) {
    const linhas = Math.max(1, Math.ceil(s.disciplinas.length / colunas));
    s.disciplinas.forEach((d, i) => {
      cartoes.push({ ...d, semestre: s.numero, largura: w, altura: h,
        x: ROTULO + (i % colunas) * (w + VAO), y: y + Math.floor(i / colunas) * (h + VAO) });
    });
    const altura = linhas * h + (linhas - 1) * VAO;
    semestres.push({ numero: s.numero, creditos: s.creditos, y, altura });
    y += altura + ENTRE_SEMESTRES;
  }
  return { cartoes, semestres, largura: ROTULO + util, altura: Math.max(0, y - ENTRE_SEMESTRES), comNomes };
}

/** What a discipline requires and what it unlocks, within this curriculum. */
export function relacoes(requisitos: Requisito[], sigla: string): { precisa: Requisito[]; libera: Requisito[] } {
  return { precisa: requisitos.filter((r) => r.para === sigla), libera: requisitos.filter((r) => r.de === sigla) };
}

/**
 * An arrow from the required card to the one that needs it: out of the bottom of the earlier card
 * into the top of the later one (a gentle S), or side to side when both sit in the same row.
 */
export function curva(de: Cartao, para: Cartao): string {
  const n = (v: number) => v.toFixed(1);
  if (Math.abs(de.y - para.y) < 1) {
    const [a, b] = de.x < para.x ? [de.x + de.largura, para.x] : [de.x, para.x + para.largura];
    const yy = de.y + de.altura / 2;
    return `M${n(a)} ${n(yy)}L${n(b)} ${n(yy)}`;
  }
  const desce = de.y < para.y;
  const [x1, y1] = [de.x + de.largura / 2, desce ? de.y + de.altura : de.y];
  const [x2, y2] = [para.x + para.largura / 2, desce ? para.y : para.y + para.altura];
  const meio = (y1 + y2) / 2;
  return `M${n(x1)} ${n(y1)}C${n(x1)} ${n(meio)} ${n(x2)} ${n(meio)} ${n(x2)} ${n(y2)}`;
}

/** The arrowhead at the end of `curva`, pointing into the card (a small open V). */
export function ponta(de: Cartao, para: Cartao, tamanho = 5): string {
  const n = (v: number) => v.toFixed(1);
  if (Math.abs(de.y - para.y) < 1) {
    const direita = de.x < para.x;
    const x = direita ? para.x : para.x + para.largura;
    const yy = para.y + para.altura / 2;
    const s = direita ? -tamanho : tamanho;
    return `M${n(x + s)} ${n(yy - tamanho)}L${n(x)} ${n(yy)}L${n(x + s)} ${n(yy + tamanho)}`;
  }
  const desce = de.y < para.y;
  const [x, y] = [para.x + para.largura / 2, desce ? para.y : para.y + para.altura];
  const s = desce ? -tamanho : tamanho;
  return `M${n(x - tamanho)} ${n(y + s)}L${n(x)} ${n(y)}L${n(x + tamanho)} ${n(y + s)}`;
}

/** '4 créditos', '4 + 2 trab.'. */
export const creditosDe = (d: DisciplinaDoCurriculo) => (d.trabalho ? `${d.aula} + ${d.trabalho} trab.` : `${d.aula} créd.`);

export const ROTULO_DO_TIPO: Record<Requisito['tipo'], string> = { forte: 'requisito', fraco: 'requisito fraco', conjunto: 'indicação de conjunto' };
