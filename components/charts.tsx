/**
 * Small, dependency-free charts for the admin panel (react-native-svg):
 * a single-series column chart with a hover/tap tooltip and a table toggle,
 * and a ranked horizontal bar list. One series = one color, no dual axes.
 */
import React, { useState } from 'react';
import { Pressable, View, useWindowDimensions } from 'react-native';
import Svg, { Line, Path } from 'react-native-svg';

import { Texto } from './ui';
import { useTheme } from '../theme';

const ALTURA = 140;
const ESQUERDA = 36;

function passoLimpo(max: number): number {
  const bruto = Math.max(1, max) / 3;
  const base = 10 ** Math.floor(Math.log10(bruto));
  return [1, 2, 5, 10].map((m) => m * base).find((p) => p >= bruto) ?? base * 10;
}

/** Column with a 4px rounded data-end and a square baseline. */
function coluna(x: number, y: number, w: number, h: number): string {
  const r = Math.min(4, w / 2, h);
  return `M${x},${y + h}V${y + r}Q${x},${y} ${x + r},${y}H${x + w - r}Q${x + w},${y} ${x + w},${y + r}V${y + h}Z`;
}

export function Colunas({ titulo, dados, formatar = String, rotuloX }: {
  titulo: string; dados: { chave: string; valor: number }[]; formatar?: (n: number) => string; rotuloX: (chave: string) => string;
}) {
  const { colors, spacing } = useTheme();
  const { width: janela } = useWindowDimensions();
  const [largura, setLargura] = useState(Math.min(janela - 64, 640));
  const [foco, setFoco] = useState<number | null>(null);
  const [tabela, setTabela] = useState(false);
  const passo = passoLimpo(Math.max(...dados.map((d) => d.valor), 0));
  const topo = passo * 3;
  const faixa = (largura - ESQUERDA) / Math.max(dados.length, 1);
  const barra = Math.min(24, Math.max(2, faixa - 2));
  const maior = dados.reduce((m, d, i) => (d.valor > (dados[m]?.valor ?? -1) ? i : m), 0);
  const destaque = foco ?? maior;

  return (
    <View style={{ gap: spacing.sm }} onLayout={(e) => setLargura(e.nativeEvent.layout.width)}>
      <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' }}>
        <Texto v="secao">{titulo}</Texto>
        <Texto v="link" onPress={() => setTabela((t) => !t)}>{tabela ? 'Ver gráfico' : 'Ver tabela'}</Texto>
      </View>
      {tabela ? (
        <View>
          {dados.map((d) => (
            <View key={d.chave} style={{ flexDirection: 'row', justifyContent: 'space-between', paddingVertical: 2 }}>
              <Texto v="suave">{rotuloX(d.chave)}</Texto>
              <Texto v="suave" cor={colors.foreground} style={{ fontVariant: ['tabular-nums'] }}>{formatar(d.valor)}</Texto>
            </View>
          ))}
        </View>
      ) : (
        <>
          <Texto v="suave" cor={colors.foreground}>
            {dados[destaque] ? `${rotuloX(dados[destaque].chave)}: ${formatar(dados[destaque].valor)}` : ' '}
          </Texto>
          <View style={{ height: ALTURA + 18 }}>
            <Svg width={largura} height={ALTURA} style={{ position: 'absolute' }}>
              {[0, 1, 2, 3].map((i) => {
                const y = ALTURA - (i * ALTURA) / 3 + (i === 0 ? -0.5 : 0.5);
                return <Line key={i} x1={ESQUERDA} x2={largura} y1={y} y2={y} stroke={colors.line} strokeOpacity={i ? 0.08 : 0.2} strokeWidth={1} />;
              })}
              {dados.map((d, i) => {
                const h = topo ? (d.valor / topo) * (ALTURA - 1) : 0;
                const x = ESQUERDA + i * faixa + (faixa - barra) / 2;
                return h > 0 ? <Path key={d.chave} d={coluna(x, ALTURA - 1 - h, barra, h)} fill={colors.chart[0]}
                  fillOpacity={foco === null || foco === i ? 1 : 0.45} /> : null;
              })}
            </Svg>
            {[1, 2, 3].map((i) => (
              <Texto key={i} v="legenda" style={{ position: 'absolute', left: 0, width: ESQUERDA - 6, textAlign: 'right', top: ALTURA - (i * ALTURA) / 3 - 8 }}>
                {formatar(passo * i)}
              </Texto>
            ))}
            {/* Hit targets: the whole column band, not just the painted bar. */}
            <View style={{ position: 'absolute', left: ESQUERDA, right: 0, top: 0, height: ALTURA, flexDirection: 'row' }}>
              {dados.map((d, i) => (
                <Pressable key={d.chave} style={{ flex: 1 }} accessibilityLabel={`${rotuloX(d.chave)}: ${formatar(d.valor)}`}
                  onHoverIn={() => setFoco(i)} onHoverOut={() => setFoco(null)} onPressIn={() => setFoco(i)} onFocus={() => setFoco(i)} />
              ))}
            </View>
            <View style={{ position: 'absolute', left: ESQUERDA, right: 0, top: ALTURA + 2, flexDirection: 'row', justifyContent: 'space-between' }}>
              {[dados[0], dados[dados.length - 1]].filter(Boolean).map((d, i) => <Texto key={i} v="legenda">{rotuloX(d.chave)}</Texto>)}
            </View>
          </View>
        </>
      )}
    </View>
  );
}

/** Ranked horizontal bars: name, bar and value at the tip (single series, one color). */
export function Ranking({ titulo, itens, vazio = 'Sem dados no período.' }: {
  titulo: string; itens: { nome: string; valor: number }[]; vazio?: string;
}) {
  const { colors, spacing } = useTheme();
  const max = Math.max(1, ...itens.map((i) => i.valor));
  return (
    <View style={{ gap: spacing.sm }}>
      <Texto v="secao">{titulo}</Texto>
      {itens.length ? itens.map((item) => (
        <View key={item.nome} style={{ gap: 4 }} accessibilityLabel={`${item.nome}: ${item.valor}`}>
          <View style={{ flexDirection: 'row', justifyContent: 'space-between', gap: spacing.sm }}>
            <Texto v="suave" cor={colors.foreground} numberOfLines={1} style={{ flex: 1 }}>{item.nome}</Texto>
            <Texto v="suave" style={{ fontVariant: ['tabular-nums'] }}>{item.valor.toLocaleString('pt-BR')}</Texto>
          </View>
          <View style={{ height: 8, borderRadius: 4, backgroundColor: colors.line + '14' }}>
            <View style={{ width: `${(item.valor / max) * 100}%`, height: 8, borderRadius: 4, backgroundColor: colors.chart[1] }} />
          </View>
        </View>
      )) : <Texto v="legenda">{vazio}</Texto>}
    </View>
  );
}
