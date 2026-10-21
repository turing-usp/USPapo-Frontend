/**
 * The ```uspapo-curriculo``` widget: a course's required disciplines by ideal semester, with the
 * requirements between them (lib/curriculo lays it out).
 *
 * A row per semester: its number in Changa and its credits on the left, its disciplines as cards
 * (the sigla in Roboto Mono; with room, the name under it). Each card is a button: pressed, it
 * lights up, the disciplines it requires get a solid accent edge and the ones it unlocks a dashed
 * one, the rest dims, and arrows run from what is required to what needs it (dashed for a weak
 * requirement, dotted for "indicação de conjunto"); a panel above the grid says the same in words.
 * The requirements come a moment after the grid (one JupiterWeb page per discipline the first
 * time). Only the ones JupiterWeb lists for this very course are drawn: many new curricula have
 * none, which the footer says instead of borrowing another course's.
 */
import React, { memo, useMemo, useState } from 'react';
import { Pressable, View } from 'react-native';
import Svg, { Path } from 'react-native-svg';

import { Moldura, useDadosDoWidget } from './Moldura';
import { BotaoDeIcone, Texto } from '../ui';
import {
  ROTULO, ROTULO_DO_TIPO, buscarCurriculo, buscarRequisitos, creditosDe, curva, montarCurriculo, ponta, relacoes,
  type Cartao, type DadosDoCurriculo, type Requisito,
} from '../../lib/curriculo';
import { alfa, useTheme } from '../../theme';

type EstadoDosRequisitos = 'carregando' | 'pronto' | 'falhou';

function Painel({ cartao, arestas, aoFechar }: { cartao: Cartao; arestas: Requisito[]; aoFechar?: () => void }) {
  const { colors, fonts, radius, spacing, typography } = useTheme();
  const { precisa, libera } = relacoes(arestas, cartao.sigla);
  const lista = (itens: Requisito[], lado: 'de' | 'para') => itens.map((r, i) => {
    const anterior = itens[i - 1];
    const ligacao = !i ? '' : r.alternativa && anterior?.alternativa ? ' ou ' : ', ';
    return `${ligacao}${r[lado]}${lado === 'de' && r.tipo !== 'forte' ? ` (${ROTULO_DO_TIPO[r.tipo]})` : ''}`;
  }).join('');
  return (
    <View accessibilityLiveRegion="polite" style={{ flexDirection: 'row', gap: spacing.sm, padding: spacing.sm, borderRadius: radius.md,
      borderWidth: 1, borderColor: alfa(colors.accent, 0.5), backgroundColor: alfa(colors.accent, 0.07) }}>
      <View style={{ flex: 1, gap: 2 }}>
        <Texto style={{ ...typography.sm, fontFamily: fonts.body, color: colors.foreground }}>
          <Texto style={{ fontFamily: fonts.mono, ...typography.sm, color: colors.foreground }}>{cartao.sigla}</Texto>  {cartao.nome}
        </Texto>
        <Texto v="detalhe">{cartao.semestre}º semestre · {creditosDe(cartao)}{cartao.anual ? ' · anual' : ''}</Texto>
        <Texto v="legenda" style={{ color: colors.foreground }}>
          {precisa.length ? `Precisa de ${lista(precisa, 'de')}.` : 'Sem requisito dentro da grade.'}
          {libera.length ? ` Libera ${lista(libera, 'para')}.` : ''}
        </Texto>
      </View>
      {aoFechar ? <BotaoDeIcone icone="fechar" rotulo="Fechar os requisitos" lado={28} tamanho={16} onPress={aoFechar} /> : null}
    </View>
  );
}

function Grade({ dados, arestas, largura, selecionada, aoSelecionar }: {
  dados: DadosDoCurriculo; arestas: Requisito[]; largura: number; selecionada: string | null; aoSelecionar?: (sigla: string | null) => void;
}) {
  const { colors, fonts, radius, typography } = useTheme();
  const layout = useMemo(() => montarCurriculo(dados, largura), [dados, largura]);
  const porSigla = useMemo(() => new Map(layout.cartoes.map((c) => [c.sigla, c])), [layout]);
  const comRelacao = useMemo(() => new Set(arestas.flatMap((r) => [r.de, r.para])), [arestas]);
  const { precisa, libera } = selecionada ? relacoes(arestas, selecionada) : { precisa: [], libera: [] };
  const [requeridas, liberadas] = [new Set(precisa.map((r) => r.de)), new Set(libera.map((r) => r.para))];
  const setas = [...precisa, ...libera].flatMap((r) => {
    const [de, para] = [porSigla.get(r.de), porSigla.get(r.para)];
    return de && para ? [{ r, de, para }] : [];
  });
  const traco = (r: Requisito) => (r.tipo === 'fraco' ? [5, 4] : r.tipo === 'conjunto' ? [1.5, 3.5] : undefined);
  return (
    <View style={{ width: layout.largura, height: layout.altura }}>
      {layout.semestres.map((s) => (
        <View key={s.numero} style={{ position: 'absolute', left: 0, top: s.y, width: ROTULO - 8 }}>
          <Texto style={{ fontFamily: fonts.title, ...typography.lg, color: colors.foreground }}>{s.numero}º</Texto>
          <Texto v="detalhe" style={{ fontSize: 10, lineHeight: 13 }}>{s.creditos} cr</Texto>
        </View>
      ))}
      {layout.cartoes.map((c) => {
        const escolhida = c.sigla === selecionada;
        const ligada = requeridas.has(c.sigla) || liberadas.has(c.sigla);
        const apagada = !!selecionada && !escolhida && !ligada;
        return (
          <Pressable key={`${c.semestre}${c.sigla}`} accessibilityRole="button" accessibilityState={{ selected: escolhida }}
            accessibilityLabel={`${c.sigla}, ${c.nome}, ${creditosDe(c)}, ${c.semestre}º semestre`}
            accessibilityHint={comRelacao.has(c.sigla) ? 'Mostra os requisitos' : undefined}
            disabled={!aoSelecionar} onPress={() => aoSelecionar?.(escolhida ? null : c.sigla)}
            style={({ pressed }) => ({
              position: 'absolute', left: c.x, top: c.y, width: c.largura, height: c.altura, paddingHorizontal: 6, paddingVertical: 4,
              borderRadius: radius.sm, borderWidth: escolhida ? 1.5 : 1, borderStyle: liberadas.has(c.sigla) ? 'dashed' : 'solid',
              borderColor: escolhida || ligada ? colors.accent : alfa(colors.foreground, 0.14),
              backgroundColor: escolhida ? alfa(colors.accent, 0.16) : pressed ? alfa(colors.foreground, 0.1) : alfa(colors.foreground, 0.045),
              opacity: apagada ? 0.35 : 1, overflow: 'hidden',
            })}>
            <View style={{ flexDirection: 'row', alignItems: 'baseline', justifyContent: 'space-between', gap: 4 }}>
              <Texto numberOfLines={1} ellipsizeMode="clip" style={{ fontFamily: fonts.mono, fontSize: 12, lineHeight: 16, color: colors.foreground }}>{c.sigla}</Texto>
              {comRelacao.has(c.sigla) ? <View style={{ width: 5, height: 5, borderRadius: 3, backgroundColor: alfa(colors.accent, 0.7) }} /> : null}
            </View>
            {layout.comNomes ? (
              <Texto numberOfLines={2} style={{ fontFamily: fonts.body, fontSize: 11, lineHeight: 14, color: alfa(colors.foreground, 0.85) }}>{c.nome}</Texto>
            ) : null}
            <Texto v="detalhe" numberOfLines={1} style={{ fontSize: 10, lineHeight: 13 }}>{creditosDe(c)}{c.anual ? ' · anual' : ''}</Texto>
          </Pressable>
        );
      })}
      {setas.length ? (
        <Svg pointerEvents="none" width={layout.largura} height={layout.altura} style={{ position: 'absolute', left: 0, top: 0 }}>
          {setas.map(({ r, de, para }) => (
            <React.Fragment key={`${r.de}>${r.para}`}>
              <Path d={curva(de, para)} stroke={colors.canvas} strokeWidth={4} fill="none" strokeLinecap="round" />
              <Path d={curva(de, para)} stroke={colors.accent} strokeWidth={1.6} fill="none" strokeDasharray={traco(r)} strokeLinecap="round" />
              <Path d={ponta(de, para)} stroke={colors.accent} strokeWidth={1.6} fill="none" strokeLinecap="round" strokeLinejoin="round" />
            </React.Fragment>
          ))}
        </Svg>
      ) : null}
    </View>
  );
}

function Conteudo({ dados, arestas, estadoRequisitos, largura, selecionada, aoSelecionar }: {
  dados: DadosDoCurriculo; arestas: Requisito[]; estadoRequisitos: EstadoDosRequisitos; largura: number;
  selecionada: string | null; aoSelecionar?: (sigla: string | null) => void;
}) {
  const { colors, fonts, spacing, typography } = useTheme();
  const cartao = useMemo(() => {
    const d = dados.semestres.flatMap((s) => s.disciplinas.map((x) => ({ ...x, semestre: s.numero })))
      .find((x) => x.sigla === selecionada);
    return d ? { ...d, x: 0, y: 0, largura: 0, altura: 0 } : null;
  }, [dados, selecionada]);
  const util = largura - 2 * spacing.md;
  const { eletivas, livres } = dados.optativas;
  const notas = [
    estadoRequisitos === 'carregando' ? 'Carregando os requisitos…'
      : estadoRequisitos === 'falhou' ? 'Não consegui carregar os requisitos agora.'
        : arestas.length ? 'Toque numa disciplina para ver o que ela pede e o que libera.'
          : 'O JupiterWeb não lista requisitos entre as disciplinas deste curso.',
    eletivas || livres ? `Fora daqui: ${[eletivas ? `${eletivas} optativas eletivas` : '', livres ? `${livres} livres` : ''].filter(Boolean).join(' e ')}.` : '',
    dados.parcial && dados.ultimo ? `Currículo publicado até o ${dados.ultimo}º semestre; os seguintes ainda não saíram.` : '',
  ].filter(Boolean);
  return (
    <View style={{ width: largura, paddingHorizontal: spacing.md, paddingTop: spacing.xs, paddingBottom: spacing.xs, gap: spacing.md }}>
      <View>
        <Texto style={{ fontFamily: fonts.title, ...typography.base, color: colors.foreground }}>{dados.nome}</Texto>
        <Texto v="legenda">{dados.unidade}{dados.duracao ? ` · ${dados.duracao} semestres` : ''}</Texto>
      </View>
      {cartao ? <Painel cartao={cartao} arestas={arestas} aoFechar={aoSelecionar ? () => aoSelecionar(null) : undefined} /> : null}
      <Grade dados={dados} arestas={arestas} largura={util} selecionada={selecionada} aoSelecionar={aoSelecionar} />
      <View style={{ gap: 2 }}>
        {notas.map((n) => <Texto key={n} v="legenda">{n}</Texto>)}
        <Texto v="detalhe" style={{ textAlign: 'right' }}>JupiterWeb{dados.desde ? ` · currículo desde ${dados.desde}` : ''}</Texto>
      </View>
    </View>
  );
}

/** `pronto`: the block is complete. A course JupiterWeb no longer has leaves no trace. */
export const Curriculo = memo(function Curriculo({ campos, pronto }: { campos: Record<string, string>; pronto: boolean }) {
  const { layout, spacing } = useTheme();
  const estado = useDadosDoWidget(buscarCurriculo, campos, pronto);
  const requisitos = useDadosDoWidget(buscarRequisitos, campos, pronto && estado.tipo === 'pronto');
  const [largura, setLargura] = useState(0);
  const [selecionada, setSelecionada] = useState<string | null>(null);
  if (estado.tipo === 'sumiu') return null;
  const dados = estado.tipo === 'pronto' ? estado.dados : null;
  const arestas = requisitos.tipo === 'pronto' ? requisitos.dados : [];
  const estadoRequisitos: EstadoDosRequisitos = requisitos.tipo === 'pronto' || requisitos.tipo === 'sumiu' ? 'pronto'
    : requisitos.tipo === 'falhou' ? 'falhou' : 'carregando';
  return (
    <Moldura titulo="Grade curricular" detalhe={dados ? `${dados.semestres.length} semestres` : undefined}
      arquivo={`uspapo-curriculo-${campos.curso ?? ''}`} pronto={!!dados && largura > 0}
      ampliado={(l) => (dados ? (
        <Conteudo dados={dados} arestas={arestas} estadoRequisitos={estadoRequisitos} largura={Math.min(l, layout.containerMaxWidth)}
          selecionada={selecionada} aoSelecionar={setSelecionada} />
      ) : null)}>
      <View onLayout={(e) => setLargura(Math.floor(e.nativeEvent.layout.width))} style={{ minHeight: dados ? undefined : 160, paddingTop: spacing.xs }}>
        {dados && largura ? (
          <Conteudo dados={dados} arestas={arestas} estadoRequisitos={estadoRequisitos} largura={largura}
            selecionada={selecionada} aoSelecionar={setSelecionada} />
        ) : estado.tipo === 'falhou' ? (
          <View style={{ flex: 1, minHeight: 160, alignItems: 'center', justifyContent: 'center' }}>
            <Texto v="legenda">Não consegui consultar o JupiterWeb agora.</Texto>
          </View>
        ) : null}
      </View>
    </Moldura>
  );
});
