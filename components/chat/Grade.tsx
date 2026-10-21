/**
 * The ```uspapo-grade``` widget: the week of the chosen turmas as a timetable (lib/grade lays it out).
 *
 * Days across (today's in the accent), time down in proportion with the exact start and end times on
 * the axis, long empty stretches folded into a thin band. Each discipline takes a palette hue at a
 * lower opacity, with its edge in the full hue; the text stays in the text color (7:1 or more on every
 * tint) and the sigla is Roboto Mono, like every code. A clash is two blocks side by side with a dashed
 * outline and a line under the grid with the alert mark (the palette has no red). The legend names
 * each discipline and its professors. Static Views, cheap in a scrolling chat; the frame (Moldura)
 * expands it and saves it as an image.
 */
import React, { memo, useEffect, useMemo, useState } from 'react';
import { Animated, Easing, View } from 'react-native';

import { Moldura, useDadosDoWidget } from './Moldura';
import { Icone } from '../icons';
import { Texto } from '../ui';
import {
  NOME_DO_DIA, DIA_POR_EXTENSO, buscarGrade, descreverQuadro, duracao, hora, montarQuadro, naNo, rotuloDasTurmas,
  type DadosDaGrade, type Dia, type Quadro,
} from '../../lib/grade';
import { alfa, paleta, useTheme } from '../../theme';

/**
 * Each discipline's hue and its block's opacity, hues far apart first; the two neutrals differ in
 * lightness (scripted contrast: sigla ≥ 7:1, turmas ≥ 4.5:1).
 */
const TINTAS: Record<'claro' | 'escuro', readonly (readonly [string, number])[]> = {
  claro: [[paleta.laranja, 0.4], [paleta.azul, 0.3], [paleta.amarelo, 0.55], [paleta.cinzaClaro, 0.22], [paleta.azulEscuro, 0.3]],
  escuro: [[paleta.laranja, 0.4], [paleta.azul, 0.55], [paleta.amarelo, 0.3], [paleta.claro, 0.22], [paleta.cinzaClaro, 0.25]],
};
/** The time axis and the weekday row. */
const EIXO = 40;
const CABECALHO = 24;
/** Roboto Mono's advance is 0.6 em: a sigla's width is exact. */
const AVANCO = 0.6;
const DIAS_DO_RELOGIO: Dia[] = ['dom', 'seg', 'ter', 'qua', 'qui', 'sex', 'sab'];

function useTintas() {
  const { escuro } = useTheme();
  const tintas = TINTAS[escuro ? 'escuro' : 'claro'];
  return (cor: number) => {
    const [matiz, opacidade] = tintas[cor % tintas.length];
    return { borda: matiz, fundo: alfa(matiz, opacidade) };
  };
}

/** A block's text: the sigla whole when it fits at 9.5 px, else split after its letters; the turmas below when there is room. */
function TextoDoBloco({ sigla, turmas, largura, altura }: { sigla: string; turmas: string[]; largura: number; altura: number }) {
  const { colors, fonts } = useTheme();
  const util = largura - 9;
  const inteira = util >= 7 * AVANCO * 9.5;
  const fonte = Math.max(8, Math.min(12, Math.floor((util / ((inteira ? 7 : 4) * AVANCO)) * 2) / 2));
  const linha = Math.ceil(fonte * 1.2);
  const linhas = inteira ? [sigla] : [sigla.slice(0, 3), sigla.slice(3)];
  const cabem = Math.max(1, Math.floor((altura - 4) / linha));
  const estilo = { fontFamily: fonts.mono, fontSize: fonte, lineHeight: linha, color: colors.foreground };
  return (
    <>
      {linhas.slice(0, cabem).map((texto) => <Texto key={texto} numberOfLines={1} ellipsizeMode="clip" style={estilo}>{texto}</Texto>)}
      {cabem > linhas.length ? (
        <Texto numberOfLines={1} ellipsizeMode="clip" style={[estilo, { fontSize: Math.min(fonte, 10.5), color: alfa(colors.foreground, 0.8) }]}>
          {rotuloDasTurmas(turmas)}
        </Texto>
      ) : null}
    </>
  );
}

function Desenho({ quadro, largura }: { quadro: Quadro; largura: number }) {
  const { colors, fonts, spacing, typography } = useTheme();
  const tinta = useTintas();
  const coluna = (largura - EIXO - spacing.sm) / quadro.dias.length;
  const hoje = DIAS_DO_RELOGIO[new Date().getDay()];
  const linha = alfa(colors.foreground, 0.08);
  return (
    <View accessible accessibilityRole="image" accessibilityLabel={descreverQuadro(quadro)} style={{ width: largura }}>
      <View style={{ flexDirection: 'row', height: CABECALHO, marginLeft: EIXO, alignItems: 'flex-end' }}>
        {quadro.dias.map((dia) => (
          <Texto key={dia} style={{ width: coluna, textAlign: 'center', fontFamily: fonts.title, ...typography.xs,
            color: dia === hoje ? colors.accent : colors.mutedForeground }}>{NOME_DO_DIA[dia]}</Texto>
        ))}
      </View>
      <View style={{ height: quadro.altura }}>
        {quadro.pausas.map((p) => (
          <View key={p.y} style={{ position: 'absolute', top: p.y, height: p.altura, left: EIXO, right: spacing.sm, backgroundColor: alfa(colors.foreground, 0.04) }} />
        ))}
        {quadro.dias.slice(1).map((dia, i) => (
          <View key={dia} style={{ position: 'absolute', top: 0, bottom: 0, width: 1, left: EIXO + (i + 1) * coluna, backgroundColor: linha }} />
        ))}
        {quadro.marcas.map((m) => (
          <React.Fragment key={m.minuto}>
            <View style={{ position: 'absolute', top: m.y, height: 1, left: EIXO - 4, right: spacing.sm, backgroundColor: linha }} />
            <Texto v="detalhe" style={{ position: 'absolute', top: m.y - 7, left: 0, width: EIXO - 7, textAlign: 'right',
              fontSize: 10, lineHeight: 14 }}>{hora(m.minuto)}</Texto>
          </React.Fragment>
        ))}
        {quadro.aulas.map((a) => {
          const { borda, fundo } = tinta(a.cor);
          const faixa = coluna / a.faixas;
          const topo = quadro.y(a.inicio) + 1;
          const altura = quadro.y(a.fim) - topo - 1;
          const larguraDoBloco = faixa - 3;
          return (
            <View key={`${a.dia}${a.inicio}-${a.fim}${a.sigla}`} style={{
              position: 'absolute', top: topo, height: altura, left: EIXO + quadro.dias.indexOf(a.dia) * coluna + a.faixa * faixa + 1.5,
              width: larguraDoBloco, borderRadius: 6, borderLeftWidth: 3, borderLeftColor: borda, backgroundColor: fundo,
              paddingLeft: 4, paddingRight: 2, paddingTop: 2, overflow: 'hidden',
            }}>
              <TextoDoBloco sigla={a.sigla} turmas={a.turmas} largura={larguraDoBloco} altura={altura} />
              {a.choque ? (
                <View pointerEvents="none" style={{ position: 'absolute', top: 0, right: 0, bottom: 0, left: -3, borderRadius: 6,
                  borderWidth: 1.5, borderStyle: 'dashed', borderColor: colors.foreground }} />
              ) : null}
            </View>
          );
        })}
      </View>
    </View>
  );
}

function Legenda({ quadro, dados, largura }: { quadro: Quadro; dados: DadosDaGrade; largura: number }) {
  const { colors, spacing } = useTheme();
  const tinta = useTintas();
  // Two columns where they fit (the web, a tablet, the full-screen viewer on a wide screen).
  const colunas = largura >= 560 ? 2 : 1;
  const item = (largura - 2 * spacing.md - (colunas - 1) * spacing.lg) / colunas;
  return (
    <View style={{ paddingHorizontal: spacing.md, paddingTop: spacing.sm, paddingBottom: spacing.sm, gap: spacing.sm }}>
      <View style={{ flexDirection: 'row', flexWrap: 'wrap', columnGap: spacing.lg, rowGap: spacing.sm }}>
        {quadro.disciplinas.map((d) => {
          const { borda, fundo } = tinta(d.cor);
          const professores = [...new Set(d.turmas.flatMap((t) => t.professores))];
          return (
            <View key={d.sigla} style={{ width: item, flexDirection: 'row', gap: spacing.sm }}>
              <View style={{ width: 12, height: 12, marginTop: 3, borderRadius: 3, borderLeftWidth: 3, borderLeftColor: borda, backgroundColor: fundo }} />
              <View style={{ flex: 1 }}>
                <Texto v="legenda" style={{ color: colors.foreground }}>
                  <Texto v="detalhe" style={{ color: colors.foreground }}>{d.sigla} {rotuloDasTurmas(d.turmas.map((t) => t.turma))}</Texto>
                  {'  '}{d.nome}
                </Texto>
                {professores.length ? <Texto v="legenda" numberOfLines={2}>{professores.join(', ')}</Texto> : null}
              </View>
            </View>
          );
        })}
      </View>
      {quadro.choques.map((c) => (
        <View key={`${c.dia}${c.inicio}${c.siglas.join()}`} style={{ flexDirection: 'row', gap: spacing.sm }}>
          <View style={{ paddingTop: 1 }}><Icone nome="alerta" cor={colors.brand} tamanho={15} traco={2} /></View>
          <Texto v="legenda" style={{ flex: 1, color: colors.foreground }}>
            Choque {naNo(c.dia)} {DIA_POR_EXTENSO[c.dia]}, {hora(c.inicio)}–{hora(c.fim)}: {c.siglas[0]} × {c.siglas[1]}
          </Texto>
        </View>
      ))}
      <Texto v="detalhe" style={{ textAlign: 'right' }}>
        JupiterWeb{dados.periodo ? ` · ${dados.periodo.inicio} a ${dados.periodo.fim}` : ''}
      </Texto>
    </View>
  );
}

function Conteudo({ quadro, dados, largura }: { quadro: Quadro; dados: DadosDaGrade; largura: number }) {
  // A fixed width: the legend's wrapping rows would otherwise take all the room the viewer offers.
  return (
    <View style={{ width: largura }}>
      <Desenho quadro={quadro} largura={largura} />
      <Legenda quadro={quadro} dados={dados} largura={largura} />
    </View>
  );
}

/** 'uspapo-grade-2026-2' from a turma code (year, term, number). */
function arquivoDa(dados: DadosDaGrade | null): string {
  const periodo = /^(\d{4})(\d)\d+$/.exec(dados?.turmas[0]?.turma ?? '');
  return periodo ? `uspapo-grade-${periodo[1]}-${periodo[2]}` : 'uspapo-grade';
}

/**
 * `pronto`: the block is complete. A reference whose turmas are no longer published (another term)
 * leaves no trace; until the schedules arrive the box holds a placeholder height.
 */
export const Grade = memo(function Grade({ campos, pronto }: { campos: Record<string, string>; pronto: boolean }) {
  const { layout, spacing } = useTheme();
  const estado = useDadosDoWidget(buscarGrade, campos, pronto);
  const dados = estado.tipo === 'pronto' ? estado.dados : null;
  const quadro = useMemo(() => (dados ? montarQuadro(dados) : null), [dados]);
  const [largura, setLargura] = useState(0);
  const [entrada] = useState(() => new Animated.Value(0));
  const desenhado = !!quadro && largura > 0;
  useEffect(() => {
    if (desenhado) Animated.timing(entrada, { toValue: 1, duration: 280, easing: Easing.out(Easing.cubic), useNativeDriver: true }).start();
  }, [desenhado, entrada]);
  if (estado.tipo === 'sumiu' || (quadro && !quadro.altura)) return null;

  return (
    <Moldura titulo="Grade horária" detalhe={quadro ? `${duracao(quadro.minutosSemanais)} de aula por semana` : undefined}
      arquivo={arquivoDa(dados)} pronto={desenhado}
      // Full screen it keeps the chat's width (time runs at a fixed scale: wider would only stretch
      // the blocks); the viewer scales it up evenly.
      ampliado={(l) => (quadro && dados ? <Conteudo quadro={quadro} dados={dados} largura={Math.min(l, layout.chatMaxWidth)} /> : null)}>
      <View onLayout={(e) => setLargura(Math.floor(e.nativeEvent.layout.width))} style={{ minHeight: desenhado ? undefined : 160 }}>
        {desenhado && dados ? (
          <Animated.View style={{ opacity: entrada, paddingTop: spacing.xs }}><Conteudo quadro={quadro} dados={dados} largura={largura} /></Animated.View>
        ) : estado.tipo === 'falhou' ? (
          <View style={{ flex: 1, minHeight: 160, alignItems: 'center', justifyContent: 'center' }}>
            <Texto v="legenda">Não consegui carregar a grade agora.</Texto>
          </View>
        ) : null}
      </View>
    </Moldura>
  );
});
