import { ESCALA, buscarGrade, descreverQuadro, duracao, montarQuadro, rotuloDaTurma, rotuloDasTurmas, type DadosDaGrade, type TurmaDaGrade } from '../lib/grade';
import { lerWidget } from '../lib/widgets';

jest.mock('../lib/supabase', () => ({ supabase: {} }));
jest.mock('../lib/auth', () => ({ sessaoAtual: async () => ({ userId: 'u', token: 't' }) }));

const turma = (sigla: string, codigo: string, horarios: [TurmaDaGrade['horarios'][0]['dia'], string, string][]): TurmaDaGrade => ({
  sigla, nome: `Disciplina ${sigla}`, turma: codigo, tipo: 'Teórica', professores: ['Prof.'],
  horarios: horarios.map(([dia, inicio, fim]) => ({ dia, inicio, fim })),
});
const grade = (...turmas: TurmaDaGrade[]): DadosDaGrade => ({ periodo: null, turmas });

test('the fence names the turmas; the app asks the backend for their schedules', async () => {
  expect(lerWidget('uspapo-grade', 'turmas=MAC0110:2026247,MAT2454:2026203\n')).toEqual({
    tipo: 'grade', campos: { turmas: 'MAC0110:2026247,MAT2454:2026203' },
  });
  const fetch = jest.spyOn(globalThis, 'fetch').mockResolvedValue(new Response(JSON.stringify(grade()), { status: 200 }));
  await buscarGrade({ turmas: 'MAC0110:2026247,MAT2454:2026203' });
  expect(String(fetch.mock.calls[0][0])).toMatch(/\/api\/grade\?turmas=MAC0110%3A2026247%2CMAT2454%3A2026203$/);
  fetch.mockResolvedValue(new Response('{}', { status: 404 }));
  await expect(buscarGrade({ turmas: 'MAC0110:2025101' })).resolves.toBeNull();
  fetch.mockRestore();
});

test('turma labels follow JupiterWeb and durations read as hours', () => {
  expect(rotuloDaTurma('2026247')).toBe('T47');
  expect(rotuloDaTurma('2026203')).toBe('T3');
  expect(rotuloDaTurma('2')).toBe('T2');
  expect(rotuloDasTurmas(['2026202', '2026203'])).toBe('T2 e T3');
  expect(rotuloDasTurmas(['2026201', '2026202', '2026204'])).toBe('T1, T2 e T4');
  expect(duracao(740)).toBe('12h20');
  expect(duracao(720)).toBe('12h');
});

test('weekdays always, Saturday only when used; same-slot turmas share a block', () => {
  const quadro = montarQuadro(grade(
    turma('PRO3821', '2026202', [['qua', '10:10', '11:50']]),
    turma('PRO3821', '2026203', [['qua', '10:10', '11:50']]),
    turma('MAT2454', '2026203', [['ter', '07:30', '09:10'], ['sex', '09:20', '11:00']]),
  ));
  expect(quadro.dias).toEqual(['seg', 'ter', 'qua', 'qui', 'sex']);
  expect(quadro.aulas).toHaveLength(3);
  expect(quadro.aulas.find((a) => a.sigla === 'PRO3821')?.turmas).toEqual(['2026202', '2026203']);
  expect(quadro.disciplinas.map((d) => [d.sigla, d.cor])).toEqual([['PRO3821', 0], ['MAT2454', 1]]);
  expect(quadro.choques).toEqual([]);
  expect(quadro.minutosSemanais).toBe(100 * 3);
  expect(montarQuadro(grade(turma('MAC0110', '1', [['sab', '08:00', '12:00']]))).dias.at(-1)).toBe('sab');
});

test('a clash splits the column and is reported; touching classes do not clash', () => {
  const quadro = montarQuadro(grade(
    turma('MAC0110', '1', [['seg', '08:00', '10:00']]),
    turma('MAT2454', '1', [['seg', '09:00', '11:00']]),
    turma('FAP2201', '1', [['seg', '11:00', '12:00']]),
  ));
  const [mac, mat, fap] = quadro.aulas;
  expect([mac.faixa, mac.faixas, mac.choque]).toEqual([0, 2, true]);
  expect([mat.faixa, mat.faixas, mat.choque]).toEqual([1, 2, true]);
  expect([fap.faixa, fap.faixas, fap.choque]).toEqual([0, 1, false]);
  expect(quadro.choques).toEqual([{ dia: 'seg', inicio: 9 * 60, fim: 10 * 60, siglas: ['MAC0110', 'MAT2454'] }]);
  expect(descreverQuadro(quadro)).toContain('choque entre MAC0110 e MAT2454 na segunda das 09:00 às 10:00');
});

test('time runs in proportion; a long empty stretch folds into a band', () => {
  const quadro = montarQuadro(grade(
    turma('MAT2454', '1', [['ter', '07:30', '09:10']]),
    turma('MAC0110', '1', [['ter', '19:20', '21:00'], ['qui', '09:20', '11:00']]),
  ));
  const { folga, pxPorMinuto, pausa } = ESCALA;
  expect(quadro.y(7 * 60 + 30)).toBe(folga);
  expect(quadro.y(9 * 60 + 10)).toBeCloseTo(folga + 100 * pxPorMinuto);
  // 09:10–09:20 is short (in proportion); 11:00–19:20 folds.
  expect(quadro.y(9 * 60 + 20)).toBeCloseTo(folga + 110 * pxPorMinuto);
  expect(quadro.pausas).toEqual([{ y: folga + 210 * pxPorMinuto, altura: pausa }]);
  expect(quadro.y(19 * 60 + 20)).toBeCloseTo(folga + 210 * pxPorMinuto + pausa);
  expect(quadro.altura).toBeCloseTo(2 * folga + 310 * pxPorMinuto + pausa);
  // Starts and ends on the axis, but never two labels on top of each other (09:10 yields to 09:20).
  expect(quadro.marcas.map((m) => m.minuto)).toEqual([450, 560, 660, 1160, 1260]);
});

test('an empty timetable has no height (the widget draws nothing)', () => {
  expect(montarQuadro(grade(turma('MAC0110', '1', []))).altura).toBe(0);
});
