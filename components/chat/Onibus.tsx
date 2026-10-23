/**
 * The ```uspapo-onibus``` widget: the next buses at a stop, counting down (lib/onibus).
 *
 * One row per line and direction: the line in Roboto Mono (BUSP circulars marked, the paid lines
 * after them), where it goes, and the minutes to the next bus in Changa, the ones after it below.
 * A live ETA (Olho Vivo) carries a beating dot in the accent; a scheduled one says "agendado" and
 * stays in the text color, so the student never reads the schedule as a promise. The minutes count
 * down every 15 s from each arrival's instant, and the data comes again every 30 s while the app
 * is in front, for 15 minutes after the answer (or the last press of Atualizar): an old
 * conversation does not keep asking.
 */
import React, { memo, useEffect, useState } from 'react';
import { Animated, Easing, View } from 'react-native';

import { Carregando, Moldura } from './Moldura';
import { BotaoDeIcone, Texto } from '../ui';
import {
  SITUACOES, aindaPorVir, descreverLinha, fonteDosOnibus, horaDe, minutosAte, rotuloDosMinutos,
  type DadosDoOnibus, type LinhaNaParada,
} from '../../lib/onibus';
import { useOnibus } from '../../lib/useOnibus';
import { alfa, useTheme } from '../../theme';

/** '6', '6 e 13', '6, 13 e 19'. */
const juntar = (itens: string[]) => (itens.length > 1 ? `${itens.slice(0, -1).join(', ')} e ${itens.at(-1)}` : itens.join(''));

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

function Linha({ linha, agora, buscando }: { linha: LinhaNaParada; agora: number; buscando: boolean }) {
  const { colors, fonts, radius, spacing, typography } = useTheme();
  const chegadas = aindaPorVir(linha.chegadas, agora);
  const [primeira, ...depois] = chegadas;
  const situacao = linha.situacao === 'ok' ? 'sem_horario' : linha.situacao;
  return (
    <View accessible accessibilityLabel={buscando ? `${linha.linha}: atualizando os horários` : descreverLinha(linha, agora)}
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
            {[depois.length ? `depois em ${juntar(depois.map((c) => `${Math.max(1, minutosAte(c.instante, agora))} min (${buscando ? 'atualizando' : c.ao_vivo ? 'ao vivo' : 'agendado'})`))}` : '',
              linha.intervalo_min ? `a cada ${linha.intervalo_min} min` : ''].filter(Boolean).join(' · ')}
          </Texto>
        ) : null}
      </View>
      {primeira ? (
        <View style={{ alignItems: 'flex-end', gap: 1 }}>
          <Texto style={{ fontFamily: fonts.title, ...typography.xl, color: !buscando && primeira.ao_vivo ? colors.accent : colors.foreground }}>
            {rotuloDosMinutos(minutosAte(primeira.instante, agora))}
          </Texto>
          <View style={{ flexDirection: 'row', alignItems: 'center', gap: 5 }}>
            {!buscando && primeira.ao_vivo ? <AoVivo /> : null}
            <Texto v="detalhe">{buscando ? 'atualizando' : primeira.ao_vivo ? 'ao vivo' : `agendado ${horaDe(primeira.instante)}`}</Texto>
          </View>
        </View>
      ) : <Texto v="legenda">{SITUACOES[situacao]}</Texto>}
    </View>
  );
}

function Conteudo({ dados, agora, buscando, largura }: { dados: DadosDoOnibus; agora: number; buscando: boolean; largura?: number }) {
  const { colors, spacing } = useTheme();
  return (
    <View style={{ width: largura, paddingHorizontal: spacing.md, paddingTop: spacing.xs, gap: spacing.xs }}>
      {dados.linhas.map((l, i) => (
        <View key={`${l.linha}${l.sentido}`} style={i ? { borderTopWidth: 1, borderColor: alfa(colors.foreground, 0.08) } : null}>
          <Linha linha={l} agora={agora} buscando={buscando} />
        </View>
      ))}
    </View>
  );
}

/** `pronto`: the block is complete (an answer still streaming may hold half a reference). */
export const Onibus = memo(function Onibus({ campos, pronto }: { campos: Record<string, string>; pronto: boolean }) {
  const { spacing } = useTheme();
  const { estado, atualizar, agora } = useOnibus(campos, pronto);
  const buscando = estado.buscando;

  if (estado.tipo === 'sumiu') return null;
  const dados = estado.tipo === 'pronto' ? estado.dados : null;
  const linhas = (campos.linhas ?? '').split(',').filter(Boolean);
  const aviso = (
    <View style={{ minHeight: 72, alignItems: 'center', justifyContent: 'center', paddingHorizontal: spacing.md }}>
      {buscando ? <Carregando /> : estado.tipo === 'falhou' ? <Texto v="legenda">Não consegui atualizar os horários. Toque em atualizar para tentar novamente.</Texto>
        : estado.tipo === 'pausado' ? <Texto v="legenda">Atualização pausada. Toque em atualizar para consultar os horários atuais.</Texto> : <Carregando />}
    </View>
  );
  return (
    <Moldura titulo="Próximos ônibus" detalhe={dados?.parada} fonte={buscando ? 'Consultando a SPTrans…' : dados ? fonteDosOnibus(dados, agora) : undefined}
      extra={(lado) => <BotaoDeIcone icone="atualizar" rotulo="Atualizar os horários" lado={lado} desabilitado={buscando} onPress={() => void atualizar()} />}
      arquivo={`uspapo-onibus-${linhas[0] ?? 'parada'}`} pronto={!!dados && !buscando}
      ampliado={(l) => (dados ? <Conteudo dados={dados} agora={agora} buscando={buscando} largura={Math.min(l, 520)} /> : aviso)}>
      {dados ? (
        <>
          <Conteudo dados={dados} agora={agora} buscando={buscando} />
          <Texto v="detalhe" style={{ paddingHorizontal: spacing.md, paddingTop: spacing.xs }}>
            O cartão é atualizado; o texto acima registra a consulta original.
          </Texto>
        </>
      ) : aviso}
    </Moldura>
  );
});
