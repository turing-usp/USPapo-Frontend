import React from 'react';
import { act, create, type ReactTestRenderer } from 'react-test-renderer';
import { AppState } from 'react-native';

import { buscarOnibus, fonteDosOnibus, type DadosDoOnibus } from '../lib/onibus';
import { useOnibus } from '../lib/useOnibus';

jest.mock('../lib/supabase', () => ({ supabase: {} }));
jest.mock('../lib/auth', () => ({ sessaoAtual: async () => ({ token: 'test' }) }));
jest.mock('../lib/onibus', () => ({ ...jest.requireActual('../lib/onibus'), buscarOnibus: jest.fn() }));

const NOW = Date.parse('2026-10-22T17:30:00-03:00');
const CAMPOS = { linhas: '8084-10', paradas: '120010357' };
const dados = (ao_vivo: boolean): DadosDoOnibus => ({
  parada: 'Biênio', atualizado_em: '2026-10-22T17:30:00-03:00', ao_vivo, api_falhou: false,
  linhas: [{ linha: '8084-10', sentido: 'Cid. Universitária', busp: true, intervalo_min: null, situacao: 'ok',
    chegadas: [{ instante: '2026-10-22T17:41:00-03:00', ao_vivo, acessivel: null }] }],
});
type Consulta = ReturnType<typeof useOnibus>;
const estados: Record<string, Consulta> = {};
const telas: ReactTestRenderer[] = [];
const appStateOriginal = Object.getOwnPropertyDescriptor(AppState, 'currentState')!;
beforeAll(() => Object.defineProperty(AppState, 'currentState', { configurable: true, value: 'active' }));
afterAll(() => Object.defineProperty(AppState, 'currentState', appStateOriginal));
function Harness({ id, campos = CAMPOS, pronto = true }: { id: string; campos?: Record<string, string>; pronto?: boolean }) {
  estados[id] = useOnibus(campos, pronto);
  return null;
}
async function montar(children: React.ReactElement) {
  let tela!: ReactTestRenderer;
  await act(async () => { tela = create(children); });
  telas.push(tela);
  return tela;
}
beforeEach(() => {
  jest.useFakeTimers();
  jest.setSystemTime(NOW);
  jest.mocked(buscarOnibus).mockReset().mockResolvedValue(dados(true));
});
afterEach(async () => {
  await act(async () => { telas.splice(0).forEach((t) => t.unmount()); });
  jest.restoreAllMocks();
  jest.useRealTimers();
});

test('duplicate cards use one request, the same snapshot and the same clock', async () => {
  await montar(<><Harness id="a" /><Harness id="b" /></>);
  expect(buscarOnibus).toHaveBeenCalledTimes(1);
  expect(estados.a.estado).toBe(estados.b.estado);
  await act(async () => { jest.advanceTimersByTime(15_000); });
  expect(estados.a.agora).toBe(NOW + 15_000);
  expect(estados.a.agora).toBe(estados.b.agora);
  expect(buscarOnibus).toHaveBeenCalledTimes(1);
});

test.each([[true, false], [false, true]])('refresh changes every copy from live=%s to live=%s', async (antes, depois) => {
  jest.mocked(buscarOnibus).mockResolvedValueOnce(dados(antes));
  await montar(<><Harness id="a" /><Harness id="b" /></>);
  jest.mocked(buscarOnibus).mockResolvedValueOnce(dados(depois));
  await act(async () => { await estados.a.atualizar(); });
  for (const id of ['a', 'b']) expect(estados[id].estado).toMatchObject({ tipo: 'pronto', buscando: false, dados: { ao_vivo: depois } });
  expect(estados.a.estado).toBe(estados.b.estado);
});

test('overlapping refreshes share the pending request and publish its current condition', async () => {
  await montar(<><Harness id="a" /><Harness id="b" /></>);
  let resolver!: (v: DadosDoOnibus) => void;
  jest.mocked(buscarOnibus).mockImplementationOnce(() => new Promise((r) => { resolver = r; }));
  let a!: Promise<void>, b!: Promise<void>;
  act(() => { a = estados.a.atualizar(); b = estados.b.atualizar(); });
  expect(a).toBe(b);
  expect(buscarOnibus).toHaveBeenCalledTimes(2);
  expect(estados.a.estado.buscando).toBe(true);
  await act(async () => { resolver(dados(false)); await a; });
  expect(estados.b.estado).toMatchObject({ tipo: 'pronto', buscando: false, dados: { ao_vivo: false } });
});

test('a failed refresh removes the previously live snapshot from all cards; retry recovers', async () => {
  await montar(<><Harness id="a" /><Harness id="b" /></>);
  jest.mocked(buscarOnibus).mockRejectedValueOnce(new Error('offline'));
  await act(async () => { await estados.a.atualizar(); });
  expect(estados.a.estado).toEqual({ tipo: 'falhou', buscando: false });
  expect(estados.b.estado).toBe(estados.a.estado);
  await act(async () => { await estados.b.atualizar(); });
  expect(estados.a.estado).toMatchObject({ tipo: 'pronto', dados: { ao_vivo: true } });
});

test('an automatic refresh can also replace live data with the schedule', async () => {
  await montar(<Harness id="auto" />);
  jest.mocked(buscarOnibus).mockResolvedValueOnce(dados(false));
  await act(async () => { await jest.advanceTimersByTimeAsync(30_000); });
  expect(estados.auto.estado).toMatchObject({ tipo: 'pronto', dados: { ao_vivo: false } });
  expect(buscarOnibus).toHaveBeenCalledTimes(2);
});

test('different stops remain separate queries and do not overwrite each other', async () => {
  jest.mocked(buscarOnibus).mockResolvedValueOnce(dados(true)).mockResolvedValueOnce(dados(false));
  await montar(<><Harness id="bienio" /><Harness id="terminal" campos={{ ...CAMPOS, paradas: '1211391' }} /></>);
  expect(buscarOnibus).toHaveBeenCalledTimes(2);
  expect(estados.bienio.estado).toMatchObject({ tipo: 'pronto', dados: { ao_vivo: true } });
  expect(estados.terminal.estado).toMatchObject({ tipo: 'pronto', dados: { ao_vivo: false } });
});

test('equivalent lists with spaces, duplicates or a different order share one query', async () => {
  await montar(<><Harness id="a" campos={{ linhas: '8084-10,8085-10', paradas: '120010357' }} />
    <Harness id="b" campos={{ linhas: ' 8085-10, 8084-10,8085-10 ', paradas: '120010357' }} /></>);
  expect(buscarOnibus).toHaveBeenCalledTimes(1);
  expect(estados.a.estado).toBe(estados.b.estado);
});

test('an unfinished widget does not fetch; completing it starts the query', async () => {
  const tela = await montar(<Harness id="stream" pronto={false} />);
  expect(buscarOnibus).not.toHaveBeenCalled();
  await act(async () => { tela.update(<Harness id="stream" pronto />); });
  expect(buscarOnibus).toHaveBeenCalledTimes(1);
});

test('unmounting cancels its request, and a late result cannot overwrite a new mount', async () => {
  let resolver!: (v: DadosDoOnibus) => void;
  jest.mocked(buscarOnibus).mockImplementationOnce(() => new Promise((r) => { resolver = r; }));
  const tela = await montar(<Harness id="old" />);
  const signal = jest.mocked(buscarOnibus).mock.calls[0][1]!;
  await act(async () => { tela.unmount(); });
  expect(signal.aborted).toBe(true);
  jest.mocked(buscarOnibus).mockResolvedValueOnce(dados(false));
  await montar(<Harness id="new" />);
  await act(async () => { resolver(dados(true)); });
  expect(estados.new.estado).toMatchObject({ tipo: 'pronto', dados: { ao_vivo: false } });
});

test('after the refresh window, old arrivals are paused rather than advertised as live', async () => {
  await montar(<Harness id="paused" />);
  await act(async () => { await jest.advanceTimersByTimeAsync(15 * 60_000); });
  expect(estados.paused.estado).toEqual({ tipo: 'pausado', buscando: false });
  await act(async () => { await estados.paused.atualizar(); });
  expect(estados.paused.estado.tipo).toBe('pronto');
});

test('a missing reference clears all matching cards', async () => {
  await montar(<><Harness id="a" /><Harness id="b" /></>);
  jest.mocked(buscarOnibus).mockResolvedValueOnce(null);
  await act(async () => { await estados.a.atualizar(); });
  expect(estados.a.estado).toEqual({ tipo: 'sumiu', buscando: false });
  expect(estados.b.estado).toBe(estados.a.estado);
});

test('the footer distinguishes mixed arrivals and disregards an inconsistent aggregate flag', () => {
  const mixed = dados(true);
  mixed.linhas.push(dados(false).linhas[0]);
  expect(fonteDosOnibus(mixed, NOW)).toContain('Ao vivo e agendados');
  expect(fonteDosOnibus({ ...dados(false), ao_vivo: true }, NOW)).toContain('Horários agendados');
  expect(fonteDosOnibus({ ...dados(true), ao_vivo: false }, NOW)).toContain('Ao vivo');
});

test('expired live arrivals do not keep a live label on the footer', () => {
  const mixed = dados(true);
  mixed.linhas[0].chegadas[0].instante = '2026-10-22T17:28:00-03:00';
  mixed.linhas[0].chegadas.push(...dados(false).linhas[0].chegadas);
  expect(fonteDosOnibus(mixed, NOW)).toContain('Horários agendados');
  expect(fonteDosOnibus(mixed, NOW)).not.toContain('Ao vivo');
});
