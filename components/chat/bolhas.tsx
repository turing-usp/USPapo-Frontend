/**
 * The chat line components (P8): user/assistant bubbles, the compact
 * tool-status lines (label + pulse while start..end, done + results when
 * end), the sources row (tappable URLs), the error line with "Tentar de
 * novo" and the interruption note.
 *
 * Copy is pt-BR and ported from the old site (Fontes/StatusBlock); the
 * assistant bubble uses the glass.surface+hairline combo and the math-aware
 * Matematica renderer (raw text while streaming).
 */
import type { ReactNode } from 'react';
import { Animated, Linking, Pressable, Text, View } from 'react-native';

import { useTheme } from '../../theme';
import type { Turno } from '../../app/(main)/chat/useChat';
import { Matematica } from './Matematica';

// ─────────────────────────────────────────────
// Sources ("Fontes consultadas")
// ─────────────────────────────────────────────

/** Port of the old site's `rotular`: host + path for the pill label. */
function rotular(url: string): string {
  try {
    const { hostname, pathname } = new URL(url);
    const host = hostname.replace(/^www\./, '');
    const caminho = pathname.replace(/\/+$/, '');
    return caminho ? `${host}${caminho}` : host;
  } catch {
    return url;
  }
}

export function Fontes({ urls }: { urls: string[] }) {
  const { colors, glass, radius, spacing, typography } = useTheme();
  if (urls.length === 0) return null;
  return (
    <View style={{ marginTop: spacing.sm }}>
      <Text
        style={{
          color: colors.mutedForeground,
          fontSize: typography.xs.fontSize,
          fontWeight: '600',
          marginBottom: spacing.xs,
          textTransform: 'uppercase',
          letterSpacing: 0.6,
          opacity: 0.8,
        }}
      >
        Fontes consultadas
      </Text>
      <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 6 }}>
        {urls.map((url) => (
          <Pressable
            key={url}
            accessibilityLabel={url}
            onPress={() => {
              void Linking.openURL(url).catch(() => undefined);
            }}
            style={({ pressed }) => [
              glass.surface,
              glass.hairline,
              {
                borderRadius: radius.full,
                flexDirection: 'row',
                alignItems: 'center',
                gap: 6,
                paddingVertical: 5,
                paddingHorizontal: spacing.sm,
                opacity: pressed ? 0.7 : 1,
                maxWidth: '100%',
              },
            ]}
          >
            <Text style={{ color: colors.brand, fontSize: typography.xs.fontSize }}>↗</Text>
            <Text
              numberOfLines={1}
              style={{
                color: colors.mutedForeground,
                fontSize: typography.xs.fontSize,
                flexShrink: 1,
              }}
            >
              {rotular(url)}
            </Text>
          </Pressable>
        ))}
      </View>
    </View>
  );
}

// ─────────────────────────────────────────────
// Tool-status lines (the old site's StatusBlock, per tool call)
// ─────────────────────────────────────────────

export function LinhaFerramenta({
  turno,
  pulso,
}: {
  turno: Extract<Turno, { autor: 'ferramenta' }>;
  pulso: Animated.AnimatedInterpolation<number>;
}) {
  const { colors, glass, radius, spacing, typography } = useTheme();
  const rotulo =
    turno.pronta && turno.resultados > 0
      ? `${turno.rotulo} · ${turno.resultados}`
      : turno.rotulo;
  return (
    <View style={{ alignSelf: 'flex-start', maxWidth: '92%' }}>
      <View
        style={[
          glass.surface,
          glass.hairline,
          {
            borderRadius: radius.full,
            flexDirection: 'row',
            alignItems: 'center',
            gap: spacing.xs,
            paddingHorizontal: spacing.md,
            paddingVertical: 6,
          },
        ]}
      >
        {turno.pronta ? (
          <Text style={{ color: colors.brand, fontSize: typography.xs.fontSize }}>✓</Text>
        ) : (
          <Animated.Text
            style={{
              color: colors.brand,
              fontSize: typography.xs.fontSize,
              opacity: pulso,
            }}
          >
            ●
          </Animated.Text>
        )}
        <Text
          numberOfLines={1}
          style={{
            color: turno.pronta ? colors.mutedForeground : colors.brand,
            fontSize: typography.xs.fontSize,
            fontWeight: '500',
            flexShrink: 1,
          }}
        >
          {rotulo}
        </Text>
      </View>
    </View>
  );
}

// ─────────────────────────────────────────────
// Error line + "Tentar de novo"
// ─────────────────────────────────────────────

export function LinhaErro({
  turno,
  aoTentar,
  podeTentar,
}: {
  turno: Extract<Turno, { autor: 'erro' }>;
  aoTentar: () => void;
  podeTentar: boolean;
}) {
  const { colors, radius, spacing, typography } = useTheme();
  return (
    <View
      style={{
        alignSelf: 'flex-start',
        maxWidth: '92%',
        borderRadius: radius.lg,
        borderLeftColor: colors.danger,
        borderLeftWidth: 3,
        backgroundColor: colors.scrim,
        padding: spacing.md,
        gap: spacing.sm,
      }}
    >
      <Text
        style={{
          color: colors.foreground,
          fontSize: typography.sm.fontSize,
          lineHeight: typography.sm.lineHeight,
        }}
      >
        {turno.mensagem}
      </Text>
      {podeTentar && turno.tipo !== 'sessao' ? (
        <Pressable
          onPress={aoTentar}
          disabled={!podeTentar}
          style={({ pressed }) => ({
            alignSelf: 'flex-start',
            backgroundColor: colors.brand,
            borderRadius: radius.full,
            opacity: pressed ? 0.85 : 1,
            paddingHorizontal: spacing.md,
            paddingVertical: 6,
          })}
          accessibilityLabel="Tentar de novo"
        >
          <Text
            style={{
              color: colors.brandForeground,
              fontSize: typography.xs.fontSize,
              fontWeight: '700',
            }}
          >
            Tentar de novo
          </Text>
        </Pressable>
      ) : null}
    </View>
  );
}

// ─────────────────────────────────────────────
// Interruption note (Stop pressed)
// ─────────────────────────────────────────────

export function LinhaNota({ texto }: { texto: string }) {
  const { colors, spacing, typography } = useTheme();
  return (
    <Text
      style={{
        color: colors.faintForeground,
        fontSize: typography.xs.fontSize,
        fontStyle: 'italic',
        alignSelf: 'flex-start',
        marginTop: spacing.xs,
      }}
    >
      {texto}
    </Text>
  );
}

// ─────────────────────────────────────────────
// Bubbles
// ─────────────────────────────────────────────

export function BolhaUsuario({ texto }: { texto: string }) {
  const { colors, radius, spacing, typography } = useTheme();
  return (
    <View
      style={{
        alignSelf: 'flex-end',
        backgroundColor: colors.brand,
        borderRadius: radius.lg,
        borderBottomRightRadius: 4,
        padding: spacing.md,
        maxWidth: '85%',
      }}
    >
      <Text
        style={{
          color: colors.brandForeground,
          fontSize: typography.base.fontSize,
          lineHeight: typography.base.lineHeight,
        }}
      >
        {texto}
      </Text>
    </View>
  );
}

export function BolhaAssistente({
  turno,
  children,
}: {
  turno: Extract<Turno, { autor: 'assistant' }>;
  /** The feedback row (like/dislike), rendered under the answer. */
  children?: ReactNode;
}) {
  const { glass, radius, spacing } = useTheme();
  return (
    <View style={{ alignSelf: 'flex-start', maxWidth: '92%' }}>
      <View
        style={[
          glass.surface,
          glass.hairline,
          {
            borderRadius: radius.lg,
            borderBottomLeftRadius: 4,
            padding: spacing.md,
          },
        ]}
      >
        {/* Math only on the completed text; raw (incremental) while streaming. */}
        <Matematica texto={turno.texto} pronto={turno.completo} />
      </View>
      <Fontes urls={turno.fontes} />
      {children}
    </View>
  );
}
