/**
 * The ```uspapo-sala``` widget: where a discipline's classes are (lib/sala, from USPolis).
 *
 * With several turmas, chips pick one (each a button). The campus base layer (the trip map's)
 * shows the turma's buildings, each a pin in the accent with its name and rooms beside it; below,
 * every class: the day in Changa, the time and the room in Roboto Mono, the building. A class
 * without a room says so ("sala ainda não alocada"): it is common, and never left out. Rooms
 * change during the term, which the footnote says.
 */
import React, { memo, useMemo, useState } from 'react';
import { Pressable, View } from 'react-native';
import Svg, { Circle } from 'react-native-svg';

import { BaseDoCampus } from './Mapa';
import { Moldura, useDadosDoWidget } from './Moldura';
import { Texto, tintaDoToque } from '../ui';
import { NOME_DO_DIA, rotuloDaTurma } from '../../lib/grade';
import { buscarSala, enquadrarPredios, faixaDe, prediosDaTurma, type DadosDaSala, type PredioNoMapa } from '../../lib/sala';
import { alfa, useTheme } from '../../theme';

const ASPECTO = 1.6;
const ALTURA_MAXIMA = 260;

function MapaDosPredios({ predios, largura }: { predios: PredioNoMapa[]; largura: number }) {
  const { colors, fonts, spacing } = useTheme();
  const altura = Math.min(ALTURA_MAXIMA, largura / ASPECTO);
  const caixa = useMemo(() => enquadrarPredios(predios, largura / altura), [predios, largura, altura]);
  const px = caixa[2] / largura;
  const naTela = ([x, y]: [number, number]) => [(x - caixa[0]) / px, (y - caixa[1]) / px];
  return (
    <View accessible accessibilityRole="image" accessibilityLabel={`Mapa: ${predios.map((p) => p.nome).join(', ')}`}
      style={{ width: largura, height: altura, overflow: 'hidden', backgroundColor: alfa(colors.foreground, 0.03) }}>
      <Svg width={largura} height={altura} viewBox={caixa.join(' ')}>
        <BaseDoCampus px={px} />
        {predios.map((p) => (
          <React.Fragment key={p.nome}>
            <Circle cx={p.ponto[0]} cy={p.ponto[1]} r={11 * px} fill={alfa(colors.accent, 0.22)} />
            <Circle cx={p.ponto[0]} cy={p.ponto[1]} r={6 * px} fill={colors.accent} stroke={colors.canvas} strokeWidth={2 * px} />
          </React.Fragment>
        ))}
      </Svg>
      {/* Labels as text (fonts SVG text would not load), on the canvas color to stay legible. */}
      {predios.map((p) => {
        const [x, y] = naTela(p.ponto);
        const esquerda = x > largura * 0.62;
        return (
          <View key={p.nome} pointerEvents="none" style={{ position: 'absolute', top: y - 11, maxWidth: largura * 0.5,
            ...(esquerda ? { right: largura - x + 14 } : { left: x + 14 }),
            paddingHorizontal: 5, borderRadius: 4, backgroundColor: alfa(colors.canvas, 0.85) }}>
            <Texto numberOfLines={1} style={{ fontFamily: fonts.title, fontSize: 13, lineHeight: 18, color: colors.foreground }}>{p.nome}</Texto>
            <Texto v="detalhe" numberOfLines={1} style={{ fontSize: 11, lineHeight: 14 }}>{p.salas.join(', ')}</Texto>
          </View>
        );
      })}
      <Texto v="detalhe" style={{ position: 'absolute', right: spacing.xs, bottom: 2, fontSize: 9, lineHeight: 12 }}>© OpenStreetMap</Texto>
    </View>
  );
}

function Conteudo({ dados, turma, aoEscolher, largura }: {
  dados: DadosDaSala; turma: number; aoEscolher?: (i: number) => void; largura: number;
}) {
  const { colors, fonts, radius, spacing, typography } = useTheme();
  const atual = dados.turmas[Math.min(turma, dados.turmas.length - 1)];
  const predios = useMemo(() => prediosDaTurma(dados, atual), [dados, atual]);
  return (
    <View style={{ width: largura, gap: spacing.sm }}>
      <Texto v="legenda" style={{ paddingHorizontal: spacing.md, color: colors.foreground }}>{dados.nome}</Texto>
      {dados.turmas.length > 1 ? (
        <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: spacing.xs, paddingHorizontal: spacing.md }}>
          {dados.turmas.map((t, i) => {
            const escolhida = t === atual;
            return (
              <Pressable key={t.codigo} accessibilityRole="button" accessibilityState={{ selected: escolhida }}
                accessibilityLabel={`Turma ${rotuloDaTurma(t.codigo)}${t.professores[0] ? `, ${t.professores[0]}` : ''}`}
                disabled={!aoEscolher} onPress={() => aoEscolher?.(i)}
                style={(e) => ({ paddingHorizontal: spacing.sm, paddingVertical: 3, borderRadius: radius.full, borderWidth: 1,
                  borderColor: escolhida ? colors.accent : alfa(colors.foreground, 0.2),
                  backgroundColor: escolhida ? alfa(colors.accent, 0.14) : tintaDoToque(e, colors.foreground) })}>
                <Texto style={{ fontFamily: fonts.mono, ...typography.xs, color: escolhida ? colors.accent : colors.foreground }}>
                  {rotuloDaTurma(t.codigo)}
                </Texto>
              </Pressable>
            );
          })}
        </View>
      ) : null}
      {predios.length ? <MapaDosPredios predios={predios} largura={largura} /> : null}
      <View style={{ paddingHorizontal: spacing.md, gap: 6 }}>
        {atual.professores.length ? <Texto v="legenda">{atual.professores.join(', ')}</Texto> : null}
        {atual.horarios.length ? atual.horarios.map((h) => (
          <View key={`${h.dia}${h.inicio}${h.sala}`} style={{ flexDirection: 'row', alignItems: 'baseline', gap: spacing.sm }}>
            <Texto style={{ width: 34, fontFamily: fonts.title, ...typography.sm, color: colors.foreground }}>{h.dia ? NOME_DO_DIA[h.dia] : '—'}</Texto>
            <Texto v="detalhe" style={{ width: 86 }}>{faixaDe(h)}</Texto>
            {h.sala ? (
              <Texto v="legenda" style={{ flex: 1, color: colors.foreground }}>
                <Texto v="detalhe" style={{ color: colors.foreground }}>{h.sala}</Texto>{h.predio ? ` · ${h.predio}` : ''}
              </Texto>
            ) : <Texto v="legenda" style={{ flex: 1 }}>sala ainda não alocada</Texto>}
          </View>
        )) : <Texto v="legenda">Sem horário publicado no USPolis.</Texto>}
      </View>
      <View style={{ paddingHorizontal: spacing.md, paddingBottom: spacing.xs, gap: 2 }}>
        <Texto v="legenda">A sala pode mudar durante o semestre: vale conferir no dia.</Texto>
        <Texto v="detalhe" style={{ textAlign: 'right' }}>USPolis{dados.periodo ? ` · ${dados.periodo}` : ''}</Texto>
      </View>
    </View>
  );
}

/** `pronto`: the block is complete. A discipline with no turma any more leaves no trace. */
export const Sala = memo(function Sala({ campos, pronto }: { campos: Record<string, string>; pronto: boolean }) {
  const { spacing } = useTheme();
  const estado = useDadosDoWidget(buscarSala, campos, pronto);
  const [largura, setLargura] = useState(0);
  const [turma, setTurma] = useState(0);
  if (estado.tipo === 'sumiu') return null;
  const dados = estado.tipo === 'pronto' ? estado.dados : null;
  return (
    <Moldura titulo="Onde é a aula" detalhe={dados?.sigla ?? campos.sigla} arquivo={`uspapo-sala-${dados?.sigla ?? campos.sigla ?? ''}`}
      pronto={!!dados && largura > 0}
      ampliado={(l) => (dados ? <Conteudo dados={dados} turma={turma} aoEscolher={setTurma} largura={Math.min(l, 640)} /> : null)}>
      <View onLayout={(e) => setLargura(Math.floor(e.nativeEvent.layout.width))} style={{ paddingTop: spacing.xs, minHeight: dados ? undefined : 120 }}>
        {dados && largura ? <Conteudo dados={dados} turma={turma} aoEscolher={setTurma} largura={largura} />
          : estado.tipo === 'falhou' ? (
            <View style={{ flex: 1, minHeight: 120, alignItems: 'center', justifyContent: 'center' }}>
              <Texto v="legenda">Não consegui consultar o USPolis agora.</Texto>
            </View>
          ) : null}
      </View>
    </Moldura>
  );
});
