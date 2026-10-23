import React from 'react';
import { act, create, type ReactTestRenderer } from 'react-test-renderer';
import { Text } from 'react-native';

import { Onibus } from '../components/chat/Onibus';
import { Moldura } from '../components/chat/Moldura';
import { buscarOnibus, type DadosDoOnibus } from '../lib/onibus';

jest.mock('../lib/supabase', () => ({ supabase: {} }));
jest.mock('../lib/auth', () => ({ sessaoAtual: async () => ({ token: 'test' }) }));
jest.mock('../lib/onibus', () => ({ ...jest.requireActual('../lib/onibus'), buscarOnibus: jest.fn() }));
jest.mock('../theme', () => ({ alfa: (c: string) => c, useTheme: () => ({
  colors: { foreground: '#fff', accent: '#f80' }, fonts: { title: 'font', mono: 'font' },
  spacing: { xs: 4, sm: 8, md: 12 }, radius: { sm: 4 }, typography: { xl: {}, sm: {} },
}) }));
jest.mock('../components/ui', () => {
  const React = require('react');
  const { Text, Pressable } = require('react-native');
  return { Texto: ({ children }: any) => <Text>{children}</Text>,
    BotaoDeIcone: ({ rotulo, onPress, desabilitado }: any) => <Pressable accessibilityLabel={rotulo} disabled={desabilitado} onPress={onPress} /> };
});
jest.mock('../components/chat/Moldura', () => {
  const React = require('react');
  const { Text, View } = require('react-native');
  return { Carregando: () => <Text>Carregando</Text>,
    Moldura: ({ children, fonte, extra }: any) => <View><Text>{fonte}</Text>{extra(32)}{children}</View> };
});

const CAMPOS = { linhas: '8084-10', paradas: '120010357' };
const dados = (ao_vivo: boolean): DadosDoOnibus => ({
  parada: 'Biênio', atualizado_em: '2026-10-22T17:30:00-03:00', ao_vivo, api_falhou: false,
  linhas: [{ linha: '8084-10', sentido: 'Cid. Universitária', busp: true, intervalo_min: null, situacao: 'ok',
    chegadas: [{ instante: '2026-10-22T17:41:00-03:00', ao_vivo, acessivel: null }] }],
});
let tela: ReactTestRenderer;
const textos = () => tela.root.findAllByType(Text).flatMap((n) => [n.props.children].flat(Infinity)).filter((s) => typeof s === 'string').join('\n');
const refresh = () => tela.root.findAllByProps({ accessibilityLabel: 'Atualizar os horários' }).find((n) => typeof n.props.onPress === 'function')!.props.onPress();
beforeEach(() => {
  jest.useFakeTimers();
  jest.setSystemTime(Date.parse('2026-10-22T17:30:00-03:00'));
  jest.mocked(buscarOnibus).mockReset().mockResolvedValue(dados(true));
});
afterEach(async () => {
  await act(async () => tela?.unmount());
  jest.useRealTimers();
});
async function montar(children = <Onibus campos={CAMPOS} pronto />) {
  await act(async () => { tela = create(children); });
}

test('the actual refresh button replaces live labels with explicit scheduled labels', async () => {
  await montar();
  expect(textos()).toContain('11 min');
  expect(textos()).toContain('ao vivo');
  jest.mocked(buscarOnibus).mockResolvedValueOnce(dados(false));
  await act(async () => { refresh(); });
  expect(textos()).toContain('11 min');
  expect(textos()).toContain('agendado 17:41');
  expect(textos()).toContain('Horários agendados');
  expect(textos()).not.toContain('ao vivo');
});

test('refreshing either repeated card updates both cards and shares the request', async () => {
  await montar(<><Onibus campos={CAMPOS} pronto /><Onibus campos={CAMPOS} pronto /></>);
  expect(buscarOnibus).toHaveBeenCalledTimes(1);
  jest.mocked(buscarOnibus).mockResolvedValueOnce(dados(false));
  await act(async () => { refresh(); });
  expect(buscarOnibus).toHaveBeenCalledTimes(2);
  expect(textos().match(/agendado 17:41/g)).toHaveLength(2);
});

test('an HTTP failure removes the previous live indicator and its countdown', async () => {
  await montar();
  jest.mocked(buscarOnibus).mockRejectedValueOnce(new Error('offline'));
  await act(async () => { refresh(); });
  expect(textos()).toContain('Não consegui atualizar');
  expect(textos()).not.toContain('ao vivo');
  expect(textos()).not.toContain('11 min');
});

test('an in-flight refresh says updating instead of reaffirming the previous live condition', async () => {
  await montar();
  let resolver!: (v: DadosDoOnibus) => void;
  jest.mocked(buscarOnibus).mockImplementationOnce(() => new Promise((r) => { resolver = r; }));
  act(() => { refresh(); });
  expect(textos()).toContain('atualizando');
  expect(textos()).toContain('Consultando a SPTrans');
  expect(textos()).not.toContain('ao vivo');
  await act(async () => { resolver(dados(false)); });
  expect(textos()).toContain('agendado 17:41');
});

test('a mixed card labels each direction and identifies both sources in the footer', async () => {
  const mixed = dados(false);
  mixed.ao_vivo = true;
  mixed.linhas.push({ ...dados(true).linhas[0], sentido: 'Metrô Butantã' });
  jest.mocked(buscarOnibus).mockResolvedValueOnce(mixed);
  await montar();
  expect(textos()).toContain('Ao vivo e agendados');
  expect(textos()).toContain('agendado 17:41');
  expect(textos()).toContain('ao vivo');
});

test('the expanded view also replaces stale live data with an error after refresh fails', async () => {
  await montar();
  jest.mocked(buscarOnibus).mockRejectedValueOnce(new Error('offline'));
  await act(async () => { refresh(); });
  const ampliar = tela.root.findByType(Moldura).props.ampliado;
  let ampliada!: ReactTestRenderer;
  await act(async () => { ampliada = create(ampliar(520, 800)); });
  expect(JSON.stringify(ampliada.toJSON())).toContain('Não consegui atualizar');
  expect(JSON.stringify(ampliada.toJSON())).not.toContain('11 min');
  await act(async () => { ampliada.unmount(); });
});
