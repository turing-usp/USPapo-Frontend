/**
 * Admin feedback screen (web-only — see ./_layout.tsx guard).
 *
 * Layout ready to wire: a list of {data, nota, motivo?} rows (most recent
 * first). The data seam is `carregarFeedback` in ./feedbackApi.ts — TODAY it
 * resolves to an empty list because the backend has no feedback endpoint
 * yet (P11 gap: main.py only serves /api/analytics/resumo; the table is
 * owner-only RLS, so the web cannot read Supabase directly), and the
 * screen renders its documented empty state. When P11 lands, the screen
 * does not change.
 */
import React, { useEffect, useState } from 'react';
import { ScrollView, StyleSheet, Text, View } from 'react-native';

import { useTheme } from '../../theme';
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
    <View
      testID="linha-feedback"
      style={[
        glass.surface,
        glass.hairline,
        {
          borderRadius: radius.md,
          flexDirection: 'row',
          gap: spacing.md,
          padding: spacing.lg,
        },
      ]}
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
    </View>
  );
}

export default function PainelFeedback() {
  const { colors, glass, radius, spacing, typography } = useTheme();

  const [itens, setItens] = useState<ItemFeedbackWeb[] | null>(null);
  const [falhou, setFalhou] = useState(false);

  useEffect(() => {
    let ativo = true;
    carregarFeedback()
      .then((lista) => {
        if (ativo) setItens(lista);
      })
      .catch(() => {
        if (ativo) setFalhou(true);
      });
    return () => {
      ativo = false;
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
          fontSize: typography['2xl'].fontSize,
          fontWeight: '800',
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
        <View
          style={[
            glass.surface,
            glass.hairline,
            {
              alignItems: 'center',
              borderRadius: radius.lg,
              gap: spacing.sm,
              padding: spacing['2xl'],
            },
          ]}
        >
          {/* Documented empty state (the backend endpoint arrives with P11). */}
          <Text
            style={{
              color: colors.mutedForeground,
              fontSize: typography.base.fontSize,
              textAlign: 'center',
            }}
          >
            As respostas de feedback chegam pelo serviço (P11)
          </Text>
          <Text style={{ color: colors.faintForeground, fontSize: typography.sm.fontSize }}>
            Aqui aparecerão as notas (gostei / não gostei) e os motivos.
          </Text>
        </View>
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
