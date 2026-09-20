/**
 * Admin analytics panel (web-only — see ./_layout.tsx guard).
 *
 * The seven KPIs of the old panel, from `GET /api/analytics/resumo`
 * (USPapo-Backend/app/analytics/metricas.py `resumo()`):
 *
 *   1. perguntas/dia      → average of serie_temporal[*].perguntas (window slice)
 *   2. tempo médio        → serie_temporal[*].latencia_media_ms (window slice,
 *                            weighted by the day's questions)
 *   3. taxa de sucesso    → 1 − Σerros/Σtotal_chamadas (desempenho_provedores)
 *   4. erros              → Σerros (desempenho_provedores)
 *   5. likes              → feedback.serie slice
 *   6. dislikes           → feedback.serie slice
 *   7. fontes mais citadas → fontes_citadas, colored with the theme's
 *                            6-slot colorblind-safe palette (stable order,
 *                            beyond six → "Outros" in a neutral color)
 *
 * States: loading (skeleton), error ("Não consegui carregar as métricas" +
 * retry), empty (zeros, never NaN). Theme-aware via the theme tokens
 * (dark scheme included). The "perguntas por dia" chart is dependency-free
 * (plain Views as bars — no chart library; victory-native is not used on
 * the web build).
 *
 * The admin header contract (worker passes headers through, so the web
 * sends X-Admin-Key from EXPO_PUBLIC_ADMIN_API_KEY) lives in ./metricas.ts.
 */
import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';

import { fonts, useTheme } from '../../theme';
import {
  ROTULO_JANELA,
  ROTULO_JANELA_SERVICO,
  barrasDePerguntas,
  carregarResumo,
  coresDeFontes,
  formataMs,
  formataNumero,
  formataPorcentagem,
  kpisDaJanela,
  type Janela,
  type ResumoDados,
} from './metricas';

const JANELAS: { valor: Janela; rotulo: string }[] = [
  { valor: '24h', rotulo: '24h' },
  { valor: '7d', rotulo: '7 dias' },
  { valor: '30d', rotulo: '30 dias' },
];

/** Default window: the chart reads best with 7 bars. */
const JANELA_PADRAO: Janela = '7d';

const ALTURA_GRAFICO = 120;

type Status = 'carregando' | 'falhou' | 'pronto';

// ─────────────────────────────────────────────
// Pieces
// ─────────────────────────────────────────────

/** One KPI card: label + value + the window it was computed over. */
function CartaoKpi({
  rotulo,
  valor,
  sub,
  testID,
}: {
  rotulo: string;
  valor: string;
  sub: string;
  testID: string;
}) {
  const { colors, glass, radius, spacing, typography } = useTheme();
  return (
    <View
      testID={testID}
      style={[
        glass.surface,
        glass.hairline,
        {
          borderRadius: radius.md,
          gap: spacing.xs,
          padding: spacing.lg,
          width: '47%',
        },
      ]}
    >
      <Text style={{ color: colors.mutedForeground, fontSize: typography.sm.fontSize }}>
        {rotulo}
      </Text>
      <Text
        style={{
          color: colors.foreground,
          fontFamily: fonts.displayBold,
          fontSize: typography['2xl'].fontSize,
        }}
      >
        {valor}
      </Text>
      <Text style={{ color: colors.faintForeground, fontSize: typography.xs.fontSize }}>{sub}</Text>
    </View>
  );
}

/** The "perguntas por dia" bar chart: one plain-View bar per day. */
function GraficoPerguntas({ barras }: { barras: { data: string; rotulo: string; valor: number }[] }) {
  const { colors, typography } = useTheme();
  const maximo = Math.max(1, ...barras.map((b) => b.valor));
  const mostraRotulo = barras.length <= 14;
  return (
    <View testID="grafico-perguntas" style={{ alignItems: 'flex-end', gap: 4 }}>
      <View style={{ alignItems: 'flex-end', flexDirection: 'row', height: ALTURA_GRAFICO, gap: 3 }}>
        {barras.map((barra) => (
          <View key={barra.data} style={{ alignItems: 'center', flex: 1 }}>
            <View
              testID="barra-dia"
              style={{
                backgroundColor: colors.brand,
                borderRadius: 3,
                height: barra.valor > 0 ? Math.max(3, (barra.valor / maximo) * ALTURA_GRAFICO) : 0,
                width: '100%',
              }}
            />
          </View>
        ))}
      </View>
      <View style={{ flexDirection: 'row', gap: 3 }}>
        {barras.map((barra) => (
          <View key={barra.data} style={{ flex: 1, alignItems: 'center' }}>
            <Text style={{ color: colors.faintForeground, fontSize: 9 }}>
              {mostraRotulo ? barra.rotulo : ''}
            </Text>
          </View>
        ))}
      </View>
    </View>
  );
}

/** A fonte row: palette dot + name + count. */
function LinhaFonte({
  nome,
  contagem,
  cor,
  testID,
}: {
  nome: string;
  contagem: number;
  cor: string;
  testID: string;
}) {
  const { colors, spacing, typography } = useTheme();
  return (
    <View
      testID={testID}
      style={{ alignItems: 'center', flexDirection: 'row', gap: spacing.sm, paddingVertical: spacing.sm }}
    >
      <View testID="fonte-ponto" style={{ backgroundColor: cor, borderRadius: 5, height: 10, width: 10 }} />
      <Text
        numberOfLines={1}
        style={{ color: colors.foreground, flex: 1, fontSize: typography.base.fontSize }}
      >
        {nome}
      </Text>
      <Text style={{ color: colors.mutedForeground, fontSize: typography.sm.fontSize }}>
        {formataNumero(contagem)}
      </Text>
    </View>
  );
}

/** The loading skeleton: the panel shape before the data arrives. */
function Esqueleto() {
  const { colors, glass, radius, spacing, typography } = useTheme();
  return (
    <View style={{ gap: spacing.xl }}>
      <Text style={{ color: colors.mutedForeground, fontSize: typography.sm.fontSize }}>
        Carregando métricas…
      </Text>
      {Array.from({ length: 6 }, (_, i) => (
        <View
          key={i}
          testID="esqueleto"
          style={[
            glass.surface,
            glass.hairline,
            { borderRadius: radius.md, height: 84, width: '47%' },
          ]}
        />
      ))}
    </View>
  );
}

/** The error state: one explicit retry, no silent loops. */
function TelaErro({ aoTentarNovamente }: { aoTentarNovamente: () => void }) {
  const { colors, glass, radius, spacing, typography } = useTheme();
  return (
    <View
      style={[
        glass.surface,
        glass.hairline,
        {
          alignItems: 'center',
          borderRadius: radius.lg,
          gap: spacing.md,
          padding: spacing['2xl'],
        },
      ]}
    >
      <Text
        style={{
          color: colors.foreground,
          fontFamily: fonts.bodyBold,
          fontSize: typography.lg.fontSize,
          textAlign: 'center',
        }}
      >
        Não consegui carregar as métricas
      </Text>
      <Text style={{ color: colors.mutedForeground, fontSize: typography.sm.fontSize }}>
        Verifique a conexão (e a chave de administrador) e tente de novo.
      </Text>
      <Pressable
        testID="botao-tentar-novamente"
        onPress={aoTentarNovamente}
        style={({ pressed }) => [
          styles.botaoBase,
          {
            backgroundColor: colors.brand,
            borderRadius: radius.full,
            opacity: pressed ? 0.85 : 1,
          },
        ]}
      >
        <Text style={{ color: colors.brandForeground, fontSize: typography.base.fontSize, fontWeight: '700' }}>
          Tentar novamente
        </Text>
      </Pressable>
    </View>
  );
}

// ─────────────────────────────────────────────
// Screen
// ─────────────────────────────────────────────

export default function PainelMetricas() {
  const { colors, glass, radius, spacing, typography } = useTheme();

  const [status, setStatus] = useState<Status>('carregando');
  const [dados, setDados] = useState<ResumoDados | null>(null);
  const [janela, setJanela] = useState<Janela>(JANELA_PADRAO);
  const [tentativa, setTentativa] = useState(0);

  const carregar = useCallback(async () => {
    setStatus('carregando');
    try {
      const resumo = await carregarResumo();
      setDados(resumo);
      setStatus('pronto');
    } catch {
      setStatus('falhou');
    }
  }, []);

  useEffect(() => {
    void carregar();
  }, [carregar, tentativa]);

  const kpis = useMemo(
    () => (dados && status === 'pronto' ? kpisDaJanela(dados, janela) : null),
    [dados, status, janela],
  );
  const barras = useMemo(
    () => (dados && status === 'pronto' ? barrasDePerguntas(dados, janela) : []),
    [dados, status, janela],
  );
  const fontes = useMemo(
    () =>
      dados && status === 'pronto'
        ? coresDeFontes(dados.fontes_citadas ?? [], colors.chart, colors.mutedForeground)
        : [],
    [dados, status, colors],
  );

  const rotuloJanela = ROTULO_JANELA[janela];

  return (
    <ScrollView
      style={{ backgroundColor: colors.canvas, flex: 1 }}
      contentContainerStyle={{ gap: spacing.xl, padding: spacing['2xl'] }}
    >
      <View style={{ gap: spacing.sm }}>
        <Text
          style={{
            color: colors.foreground,
            fontFamily: fonts.displayBold,
            fontSize: typography['2xl'].fontSize,
          }}
        >
          Painel de métricas
        </Text>
        <View style={{ flexDirection: 'row', gap: spacing.sm }}>
          {JANELAS.map((opcao) => {
            const ativa = janela === opcao.valor;
            return (
              <Pressable
                key={opcao.valor}
                testID={`janela-${opcao.valor}`}
                onPress={() => setJanela(opcao.valor)}
                style={({ pressed }) => [
                  glass.surface,
                  glass.hairline,
                  {
                    borderRadius: radius.full,
                    opacity: pressed ? 0.85 : 1,
                    paddingVertical: spacing.xs + 2,
                    paddingHorizontal: spacing.lg,
                  },
                  ativa
                    ? {
                        backgroundColor: colors.brand,
                        borderColor: colors.brand,
                        borderWidth: 1,
                      }
                    : null,
                ]}
              >
                <Text
                  style={{
                    color: ativa ? colors.brandForeground : colors.mutedForeground,
                    fontFamily: fonts.bodyBold,
                    fontSize: typography.sm.fontSize,
                  }}
                >
                  {opcao.rotulo}
                </Text>
              </Pressable>
            );
          })}
        </View>
      </View>

      {status === 'carregando' && <Esqueleto />}

      {status === 'falhou' && <TelaErro aoTentarNovamente={() => setTentativa((n) => n + 1)} />}

      {status === 'pronto' && kpis && (
        <>
          {/* The six numeric KPIs (the 7th — fontes mais citadas — is the list below). */}
          <View style={{ flexWrap: 'wrap', gap: spacing.md, justifyContent: 'space-between' }}>
            <CartaoKpi
              testID="kpi-perguntas-dia"
              rotulo="Perguntas/dia"
              valor={formataNumero(kpis.perguntasPorDia, 1)}
              sub={rotuloJanela}
            />
            <CartaoKpi
              testID="kpi-tempo-medio"
              rotulo="Tempo médio"
              valor={formataMs(kpis.tempoMedioMs)}
              sub={rotuloJanela}
            />
            <CartaoKpi
              testID="kpi-taxa-sucesso"
              rotulo="Taxa de sucesso"
              valor={formataPorcentagem(kpis.taxaSucesso)}
              sub={ROTULO_JANELA_SERVICO}
            />
            <CartaoKpi
              testID="kpi-erros"
              rotulo="Erros"
              valor={formataNumero(kpis.erros)}
              sub={ROTULO_JANELA_SERVICO}
            />
            <CartaoKpi testID="kpi-likes" rotulo="Likes" valor={formataNumero(kpis.likes)} sub={rotuloJanela} />
            <CartaoKpi
              testID="kpi-dislikes"
              rotulo="Dislikes"
              valor={formataNumero(kpis.dislikes)}
              sub={rotuloJanela}
            />
          </View>

          {/* Perguntas por dia: N bars for N days of the selected window. */}
          <View
            style={[
              glass.surface,
              glass.hairline,
              { borderRadius: radius.lg, gap: spacing.md, padding: spacing['2xl'] },
            ]}
          >
            <Text style={{ color: colors.foreground, fontSize: typography.lg.fontSize, fontWeight: '700' }}>
              Perguntas por dia
            </Text>
            <GraficoPerguntas barras={barras} />
          </View>

          {/* Fontes mais citadas: the 7th KPI, palette per the theme rule. */}
          <View
            style={[
              glass.surface,
              glass.hairline,
              { borderRadius: radius.lg, gap: spacing.sm, padding: spacing['2xl'] },
            ]}
          >
            <Text style={{ color: colors.foreground, fontSize: typography.lg.fontSize, fontWeight: '700' }}>
              Fontes mais citadas
            </Text>
            {fontes.length === 0 ? (
              <Text style={{ color: colors.mutedForeground, fontSize: typography.sm.fontSize }}>
                Nenhuma fonte citada no período.
              </Text>
            ) : (
              fontes.map((fonte) => (
                <LinhaFonte
                  key={fonte.nome}
                  testID={fonte.eOutros ? 'fonte-outros' : 'fonte-linha'}
                  nome={fonte.nome}
                  contagem={fonte.contagem}
                  cor={fonte.cor}
                />
              ))
            )}
          </View>
        </>
      )}
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  botaoBase: {
    alignItems: 'center',
    justifyContent: 'center',
    minWidth: 180,
    paddingVertical: 12,
    paddingHorizontal: 20,
  },
});
