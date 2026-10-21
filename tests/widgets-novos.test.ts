import { buscarAvaliacao, fichaInicial, fragil, nota, separarSigla, type DadosDaAvaliacao } from '../lib/avaliacao';
import { ALTURA, ROTULO, VAO, curva, montarCurriculo, ponta, relacoes, type DadosDoCurriculo, type Requisito } from '../lib/curriculo';
import { aindaPorVir, buscarOnibus, descreverLinha, horaDe, minutosAte, rotuloDosMinutos, type LinhaNaParada } from '../lib/onibus';
import { prediosDaTurma, type DadosDaSala } from '../lib/sala';
import { lerWidget } from '../lib/widgets';

jest.mock('../lib/supabase', () => ({ supabase: {} }));
jest.mock('../lib/auth', () => ({ sessaoAtual: async () => ({ userId: 'u', token: 't' }) }));

const disciplina = (sigla: string, aula = 4) => ({ sigla, nome: `Disciplina ${sigla}`, aula, trabalho: 0, anual: false });
const CURRICULO: DadosDoCurriculo = {
  codigo: '3123-3000', nome: 'Engenharia de Computação', unidade: 'Poli', duracao: 10, desde: '01/01/2026', parcial: false, ultimo: null,
  optativas: { eletivas: 0, livres: 0 },
  semestres: [
    { numero: 1, creditos: 20, disciplinas: ['A0000001', 'MAC2166', 'MAT2453', 'PCS3100', 'PCC3100'].map((s) => disciplina(s)) },
    { numero: 2, creditos: 8, disciplinas: [disciplina('MAC0122'), disciplina('MAT2454')] },
  ],
};

describe('curriculum', () => {
  test('a phone row holds sigla cards; a wide one adds the name; semesters stack', () => {
    const fone = montarCurriculo(CURRICULO, 340);
    expect(fone.comNomes).toBe(false);
    const colunas = new Set(fone.cartoes.filter((c) => c.semestre === 1).map((c) => c.x)).size;
    expect(colunas).toBe(3);
    // 5 cards in 3 columns: 2 rows; the 2nd semester starts below them.
    const [s1, s2] = fone.semestres;
    expect(s1.altura).toBe(2 * ALTURA.sigla + VAO);
    expect(s2.y).toBeGreaterThan(s1.y + s1.altura);
    expect(Math.max(...fone.cartoes.map((c) => c.x + c.largura))).toBeCloseTo(340);
    expect(Math.min(...fone.cartoes.map((c) => c.x))).toBe(ROTULO);

    const largo = montarCurriculo(CURRICULO, 900);
    expect(largo.comNomes).toBe(true);
    expect(largo.cartoes[0].altura).toBe(ALTURA.nome);
  });

  test('a card tells what it needs and what it unlocks; arrows go from the earlier card down', () => {
    const arestas: Requisito[] = [
      { de: 'MAC2166', para: 'MAC0122', tipo: 'forte', alternativa: false },
      { de: 'MAT2453', para: 'MAT2454', tipo: 'fraco', alternativa: false },
    ];
    expect(relacoes(arestas, 'MAC0122')).toEqual({ precisa: [arestas[0]], libera: [] });
    expect(relacoes(arestas, 'MAC2166')).toEqual({ precisa: [], libera: [arestas[0]] });
    const { cartoes } = montarCurriculo(CURRICULO, 340);
    const [de, para] = ['MAC2166', 'MAC0122'].map((s) => cartoes.find((c) => c.sigla === s)!);
    const d = curva(de, para);
    expect(d.startsWith(`M${(de.x + de.largura / 2).toFixed(1)} ${(de.y + de.altura).toFixed(1)}C`)).toBe(true);
    expect(d.endsWith(`${(para.x + para.largura / 2).toFixed(1)} ${para.y.toFixed(1)}`)).toBe(true);
    // The arrowhead points into the card (down).
    expect(ponta(de, para)).toMatch(new RegExp(`L${(para.x + para.largura / 2).toFixed(1)} ${para.y.toFixed(1)}L`));
  });

  test('the fence names the course; the grid and its requirements are two requests', async () => {
    expect(lerWidget('uspapo-curriculo', 'curso=3123-3000\n')).toEqual({ tipo: 'curriculo', campos: { curso: '3123-3000' } });
  });
});

describe('next buses', () => {
  const AGORA = Date.parse('2026-10-21T17:50:00-03:00');
  const linha: LinhaNaParada = {
    linha: '8084-10', sentido: 'Cid. Universitária', busp: true, intervalo_min: 6, situacao: 'ok',
    chegadas: [
      { instante: '2026-10-21T17:49:20-03:00', ao_vivo: true, acessivel: true },
      { instante: '2026-10-21T17:54:10-03:00', ao_vivo: true, acessivel: null },
      { instante: '2026-10-21T18:02:00-03:00', ao_vivo: false, acessivel: null },
    ],
  };

  test('minutes count down from each instant; a bus a few seconds late still reads "agora"', () => {
    expect(minutosAte(linha.chegadas[1].instante, AGORA)).toBe(4);
    expect(rotuloDosMinutos(minutosAte(linha.chegadas[0].instante, AGORA))).toBe('agora');
    expect(rotuloDosMinutos(12)).toBe('12 min');
    expect(horaDe(linha.chegadas[2].instante)).toBe('18:02');
    // Two minutes on, the first has gone.
    expect(aindaPorVir(linha.chegadas, AGORA + 120_000).map((c) => horaDe(c.instante))).toEqual(['17:54', '18:02']);
  });

  test('a screen reader hears the line, where it goes and when, live or scheduled', () => {
    expect(descreverLinha(linha, AGORA)).toBe(
      '8084-10 para Cid. Universitária: chegando agora, ao vivo; depois em 4 minutos, ao vivo; depois em 12 minutos, pela programação');
    expect(descreverLinha({ ...linha, chegadas: [], situacao: 'sem_servico' }, AGORA)).toBe('8084-10 para Cid. Universitária: não opera agora');
  });

  test('every refresh asks the backend again (no per-reference cache)', async () => {
    const fetch = jest.spyOn(globalThis, 'fetch').mockImplementation(async () => new Response(JSON.stringify({ linhas: [] }), { status: 200 }));
    await buscarOnibus({ linhas: '8084-10', paradas: '120010357' });
    await buscarOnibus({ linhas: '8084-10', paradas: '120010357' });
    expect(fetch).toHaveBeenCalledTimes(2);
    expect(String(fetch.mock.calls[0][0])).toMatch(/\/api\/onibus\?linhas=8084-10&paradas=120010357$/);
    fetch.mockResolvedValue(new Response('{}', { status: 404 }));
    expect(await buscarOnibus({ linhas: '8084-10', paradas: '1' })).toBeNull();
    fetch.mockResolvedValue(new Response('{}', { status: 502 }));
    await expect(buscarOnibus({ linhas: '8084-10', paradas: '1' })).rejects.toThrow();
    fetch.mockRestore();
  });
});

describe('room', () => {
  const DADOS: DadosDaSala = {
    sigla: 'MAC2166', nome: 'Introdução à Computação', periodo: '', predios: { 'Biênio': { lat: -23.55653, lon: -46.73251 } },
    turmas: [{ codigo: '2026210', professores: ['Alair Pereira do Lago'], horarios: [
      { dia: 'seg', inicio: '10:10', fim: '11:50', sala: 'C1-09', predio: 'Biênio' },
      { dia: 'qui', inicio: '10:10', fim: '11:50', sala: 'C1-09', predio: 'Biênio' },
      { dia: 'sex', inicio: '08:00', fim: '09:40', sala: null, predio: null },
    ] }],
  };

  test('each building the turma uses once, with its rooms; an unallocated class adds no pin', () => {
    const predios = prediosDaTurma(DADOS, DADOS.turmas[0]);
    expect(predios.map((p) => [p.nome, p.salas])).toEqual([['Biênio', ['C1-09']]]);
    expect(predios[0].ponto.every(Number.isFinite)).toBe(true);
  });
});

describe('professor grades', () => {
  const DADOS: DadosDaAvaliacao = {
    id: 4811, nome: 'Alair Pereira do Lago', unidade: 'IME', sem_avaliacao: 6, fonte: 'https://uspavalia.com/professor/4811',
    disciplinas: [
      { ficha: 31194, nome: 'Introdução à Computação - MAC2166', nota: 3.93, votos: 7, comentarios: 1, quesitos: [] },
      { ficha: 22002, nome: 'Laboratório de Programação I - MAC0211', nota: 5.5, votos: 1, comentarios: 1, quesitos: [] },
    ],
  };

  test('the course the answer was about opens first; otherwise the most voted', () => {
    expect(fichaInicial(DADOS, '22002')).toBe(22002);
    expect(fichaInicial(DADOS, undefined)).toBe(31194);
    expect(fichaInicial(DADOS, '999')).toBe(31194);
  });

  test('names, Portuguese decimals and fragile means', async () => {
    expect(separarSigla(DADOS.disciplinas[0].nome)).toEqual(['Introdução à Computação', 'MAC2166']);
    expect(separarSigla('Optativa')).toEqual(['Optativa', '']);
    expect(nota(3.93)).toBe('3,9');
    expect([fragil(1), fragil(2), fragil(7), fragil(null)]).toEqual([true, true, false, false]);
    const fetch = jest.spyOn(globalThis, 'fetch').mockResolvedValue(new Response(JSON.stringify(DADOS), { status: 200 }));
    await buscarAvaliacao({ professor: '4811' });
    expect(String(fetch.mock.calls[0][0])).toMatch(/\/api\/avaliacao\?professor=4811$/);
    fetch.mockRestore();
  });
});
