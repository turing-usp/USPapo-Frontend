/**
 * Admin feedback screen (web-only — see ./_layout.tsx guard).
 *
 * A list of {data, nota, motivo?} rows, most recent first. The data seam is
 * `carregarFeedback` in ./feedbackApi.ts, which reads the rows out of
 * `GET /api/analytics/resumo` (`data.feedback.itens`) — the table itself is
 * owner-only RLS, so the web can never read Supabase directly. The seam used
 * to resolve to an empty list while a dedicated endpoint was pending, which
 * meant this screen showed "no feedback" no matter how much there was.
 */
import React, { useEffect, useState } from 'react';
import { ScrollView, StyleSheet, Text, View } from 'react-native';

import { fonts, useTheme } from '../../theme';
import Glass from '../../components/Glass';
import {
  carregarFeedback,
  formataDataFeedback,
  rotuloNota,
  type ItemFeedbackWeb,
} from './feedbackApi';

/** One {data, nota, motivo?} row of the list. */
export function LinhaFeedback({ item }: { item: ItemFeedbackWeb }) {
  const { colors, glass, radius, spacing, typography } = useTheme();
  const ehLike = item.nota === 'like';
  return (
    <Glass
      testID="linha-feedback"
      radius={radius.md}
      style={{ flexDirection: 'row', gap: spacing.md, padding: spacing.lg }}
    >
      <View
        testID={ehLike ? 'nota-like' : 'nota-dislike'}
        style={[
          styles.pill,
          {
            backgroundColor: ehLike ? colors.brand : colors.danger,
          },
        ]}
      >
        <Text style={{ color: colors.brandForeground, fontSize: typography.xs.fontSize, fontWeight: '700' }}>
          {rotuloNota(item.nota)}
        </Text>
      </View>
      <View style={{ flex: 1, gap: 2 }}>
        <Text style={{ color: colors.mutedForeground, fontSize: typography.sm.fontSize }}>
          {formataDataFeedback(item.data)}
        </Text>
        {item.motivo ? (
          <Text style={{ color: colors.foreground, fontSize: typography.base.fontSize }}>
            {item.motivo}
          </Text>
        ) : null}
      </View>
    </Glass>
  );
}

export default function PainelFeedback() {
  const { colors, glass, radius, spacing, typography } = useTheme();

  const [itens, setItens] = useState<ItemFeedbackWeb[] | null>(null);
  const [falhou, setFalhou] = useState(false);

  useEffect(() => {
    let ativo = true;
    const controlador = new AbortController();
    carregarFeedback(controlador.signal)
      .then((lista) => {
        if (ativo) setItens(lista);
      })
      .catch(() => {
        // An abort is this effect tearing down, not a failure to report.
        if (ativo) setFalhou(true);
      });
    return () => {
      ativo = false;
      controlador.abort();
    };
  }, []);

  return (
    <ScrollView
      style={{ backgroundColor: colors.canvas, flex: 1 }}
      contentContainerStyle={{ gap: spacing.lg, padding: spacing['2xl'] }}
    >
      <Text
        style={{
          color: colors.foreground,
          fontFamily: fonts.displayBold,
          fontSize: typography['2xl'].fontSize,
        }}
      >
        Feedback dos alunos
      </Text>

      {falhou && (
        <Text style={{ color: colors.danger, fontSize: typography.sm.fontSize }}>
          Não consegui carregar o feedback. Recarregue a página.
        </Text>
      )}

      {!falhou && itens === null && (
        <Text style={{ color: colors.mutedForeground, fontSize: typography.sm.fontSize }}>
          Carregando feedback…
        </Text>
      )}

      {!falhou && itens !== null && itens.length === 0 && (
        <Glass
          radius={radius.lg}
          style={{
              alignItems: 'center',
              gap: spacing.sm,
              padding: spacing['2xl'],
          }}
        >
          {/* Genuinely empty: the endpoint answered with no rows in the
              30-day window. A failure takes the error branch above. */}
          <Text
            style={{
              color: colors.mutedForeground,
              fontFamily: fonts.body,
              fontSize: typography.base.fontSize,
              textAlign: 'center',
            }}
          >
            Nenhum feedback nos últimos 30 dias
          </Text>
          <Text style={{ color: colors.faintForeground, fontSize: typography.sm.fontSize }}>
            Aqui aparecerão as notas (gostei / não gostei) e os motivos.
          </Text>
                </Glass>
      )}

      {!falhou && itens !== null && itens.length > 0 && (
        <View style={{ gap: spacing.md }}>
          {itens.map((item, i) => (
            <LinhaFeedback key={`${item.data}-${i}`} item={item} />
          ))}
        </View>
      )}
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  pill: {
    alignItems: 'center',
    borderRadius: 9999,
    justifyContent: 'center',
    minWidth: 84,
    paddingVertical: 6,
    paddingHorizontal: 10,
  },
});
