/**
 * The ```uspapo-onibus``` widget: the next buses at a stop, counting down (lib/onibus).
 *
 * One row per line and direction: the line in Roboto Mono (BUSP circulars marked, the paid lines
 * after them), where it goes, and the minutes to the next bus in Changa, the ones after it below.
 * A live ETA (Olho Vivo) carries a beating dot in the accent; a scheduled one says "previsto" and
 * stays in the text color, so the student never reads the schedule as a promise. The minutes count
 * down every 15 s from each arrival's instant, and the data comes again every 30 s while the app
 * is in front, for 15 minutes after the answer (or the last press of Atualizar): an old
 * conversation does not keep asking.
 */
import React, { memo, useCallback, useEffect, useRef, useState } from 'react';
import { Animated, AppState, Easing, Platform, View } from 'react-native';

import { Carregando, Moldura, type EstadoDoWidget } from './Moldura';
import { BotaoDeIcone, Texto } from '../ui';
import {
  SITUACOES, aindaPorVir, buscarOnibus, descreverLinha, horaDe, minutosAte, rotuloDosMinutos,
  type DadosDoOnibus, type LinhaNaParada,
} from '../../lib/onibus';
import { alfa, useTheme } from '../../theme';

/** '6', '6 e 13', '6, 13 e 19'. */
const juntar = (itens: string[]) => (itens.length > 1 ? `${itens.slice(0, -1).join(', ')} e ${itens.at(-1)}` : itens.join(''));

const TIQUE_MS = 15_000;
const BUSCAR_MS = 30_000;
const JANELA_MS = 15 * 60_000;

/** The live mark: a dot in the accent that beats softly (opacity only, on the native driver). */
function AoVivo({ tamanho = 7 }: { tamanho?: number }) {
  const { colors } = useTheme();
  const [batida] = useState(() => new Animated.Value(1));
  useEffect(() => {
    const laco = Animated.loop(Animated.sequence([
      Animated.timing(batida, { toValue: 0.35, duration: 700, easing: Easing.inOut(Easing.ease), useNativeDriver: true }),
      Animated.timing(batida, { toValue: 1, duration: 700, easing: Easing.inOut(Easing.ease), useNativeDriver: true }),
    ]));
    laco.start();
    return () => laco.stop();
  }, [batida]);
  return <Animated.View style={{ width: tamanho, height: tamanho, borderRadius: tamanho / 2, backgroundColor: colors.accent, opacity: batida }} />;
}

function Linha({ linha, agora }: { linha: LinhaNaParada; agora: number }) {
  const { colors, fonts, radius, spacing, typography } = useTheme();
  const chegadas = aindaPorVir(linha.chegadas, agora);
  const [primeira, ...depois] = chegadas;
  const situacao = linha.situacao === 'ok' ? 'sem_horario' : linha.situacao;
  return (
    <View accessible accessibilityLabel={descreverLinha(linha, agora)}
      style={{ flexDirection: 'row', alignItems: 'center', gap: spacing.md, paddingVertical: spacing.xs }}>
      <View style={{ flex: 1, gap: 2 }}>
        <View style={{ flexDirection: 'row', alignItems: 'center', gap: spacing.sm, flexWrap: 'wrap' }}>
          <View style={{ paddingHorizontal: 7, paddingVertical: 1, borderRadius: radius.sm, borderWidth: 1,
            borderColor: linha.busp ? colors.accent : alfa(colors.foreground, 0.25) }}>
            <Texto style={{ fontFamily: fonts.mono, ...typography.sm, color: colors.foreground }}>{linha.linha}</Texto>
          </View>
          {linha.busp ? <Texto v="detalhe" cor={colors.accent}>BUSP</Texto> : null}
        </View>
        <Texto v="legenda" numberOfLines={1} style={{ color: colors.foreground }}>para {linha.sentido}</Texto>
        {depois.length || linha.intervalo_min ? (
          <Texto v="detalhe" numberOfLines={2}>
            {[depois.length ? `depois em ${juntar(depois.map((c) => String(Math.max(1, minutosAte(c.instante, agora)))))} min` : '',
              linha.intervalo_min ? `a cada ${linha.intervalo_min} min` : ''].filter(Boolean).join(' · ')}
          </Texto>
        ) : null}
      </View>
      {primeira ? (
        <View style={{ alignItems: 'flex-end', gap: 1 }}>
          <Texto style={{ fontFamily: fonts.title, ...typography.xl, color: primeira.ao_vivo ? colors.accent : colors.foreground }}>
            {rotuloDosMinutos(minutosAte(primeira.instante, agora))}
          </Texto>
          <View style={{ flexDirection: 'row', alignItems: 'center', gap: 5 }}>
            {primeira.ao_vivo ? <AoVivo /> : null}
            <Texto v="detalhe">{primeira.ao_vivo ? 'ao vivo' : `previsto ${horaDe(primeira.instante)}`}</Texto>
          </View>
        </View>
      ) : <Texto v="legenda">{SITUACOES[situacao]}</Texto>}
    </View>
  );
}

/** Where the times come from, and when: the frame's footer. */
function fonteDe(dados: DadosDoOnibus): string {
  const origem = dados.ao_vivo ? 'Ao vivo, Olho Vivo da SPTrans' : dados.api_falhou ? 'Pela programação (o ao vivo falhou)' : 'Pela programação da SPTrans';
  return `${origem} · ${horaDe(dados.atualizado_em)}`;
}

function Conteudo({ dados, agora, largura }: { dados: DadosDoOnibus; agora: number; largura?: number }) {
  const { colors, spacing } = useTheme();
  return (
    <View style={{ width: largura, paddingHorizontal: spacing.md, paddingTop: spacing.xs, gap: spacing.xs }}>
      {dados.linhas.map((l, i) => (
        <View key={`${l.linha}${l.sentido}`} style={i ? { borderTopWidth: 1, borderColor: alfa(colors.foreground, 0.08) } : null}>
          <Linha linha={l} agora={agora} />
        </View>
      ))}
    </View>
  );
}

/** `pronto`: the block is complete (an answer still streaming may hold half a reference). */
export const Onibus = memo(function Onibus({ campos, pronto }: { campos: Record<string, string>; pronto: boolean }) {
  const { spacing } = useTheme();
  const [estado, setEstado] = useState<EstadoDoWidget<DadosDoOnibus>>({ tipo: 'carregando' });
  const [agora, setAgora] = useState(() => Date.now());
  const [buscando, setBuscando] = useState(false);
  const ate = useRef(0);
  const chave = JSON.stringify(campos);

  const buscar = useCallback(async () => {
    setBuscando(true);
    try {
      const dados = await buscarOnibus(JSON.parse(chave));
      setEstado(dados ? { tipo: 'pronto', dados } : { tipo: 'sumiu' });
    } catch {
      // A failed refresh keeps the last data on screen (its minutes keep counting down).
      setEstado((antes) => (antes.tipo === 'pronto' ? antes : { tipo: 'falhou' }));
    } finally {
      setBuscando(false);
      setAgora(Date.now());
    }
  }, [chave]);
  const atualizar = useCallback(() => {
    ate.current = Date.now() + JANELA_MS;
    void buscar();
  }, [buscar]);

  useEffect(() => {
    if (!pronto) return;
    ate.current = Date.now() + JANELA_MS;
    const primeira = setTimeout(() => void buscar(), 0);
    let ultima = Date.now();
    const tique = setInterval(() => {
      setAgora(Date.now());
      const visivel = Platform.OS === 'web' ? typeof document === 'undefined' || document.visibilityState === 'visible'
        : AppState.currentState === 'active';
      if (visivel && Date.now() < ate.current && Date.now() - ultima >= BUSCAR_MS - 1000) {
        ultima = Date.now();
        void buscar();
      }
    }, TIQUE_MS);
    return () => {
      clearTimeout(primeira);
      clearInterval(tique);
    };
  }, [pronto, buscar]);

  if (estado.tipo === 'sumiu') return null;
  const dados = estado.tipo === 'pronto' ? estado.dados : null;
  const linhas = (campos.linhas ?? '').split(',').filter(Boolean);
  return (
    <Moldura titulo="Próximos ônibus" detalhe={dados?.parada} fonte={dados ? fonteDe(dados) : undefined}
      extra={(lado) => <BotaoDeIcone icone="atualizar" rotulo="Atualizar os horários" lado={lado} desabilitado={buscando} onPress={atualizar} />}
      arquivo={`uspapo-onibus-${linhas[0] ?? 'parada'}`} pronto={!!dados}
      ampliado={(l) => (dados ? <Conteudo dados={dados} agora={agora} largura={Math.min(l, 520)} /> : null)}>
      {dados ? (
        <Conteudo dados={dados} agora={agora} />
      ) : (
        <View style={{ minHeight: 72, alignItems: 'center', justifyContent: 'center', paddingHorizontal: spacing.md }}>
          {estado.tipo === 'falhou' ? <Texto v="legenda">Não consegui consultar os horários agora.</Texto> : <Carregando />}
        </View>
      )}
    </Moldura>
  );
});
