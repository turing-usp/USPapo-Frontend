/**
 * "Nova conversa" — the Chat tab empty state (no saved conversations yet;
 * P9 lists the local cache here).
 */
import { useRouter } from 'expo-router';
import React from 'react';
import { Pressable, Text, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { useTheme } from '../../../theme';

export default function NovaConversa() {
  const { colors, glass, radius, spacing, typography } = useTheme();
  const router = useRouter();
  const insets = useSafeAreaInsets();

  return (
    <View
      style={{
        flex: 1,
        alignItems: 'center',
        justifyContent: 'center',
        gap: spacing.lg,
        padding: spacing.xl,
        paddingBottom: insets.bottom + spacing.xl,
      }}
    >
      <View
        style={[
          glass.surface,
          glass.hairline,
          glass.shadow,
          {
            alignItems: 'center',
            borderRadius: radius.xl,
            gap: spacing.md,
            padding: spacing['2xl'],
            width: '100%',
          },
        ]}
      >
        <Text
          style={{
            color: colors.foreground,
            fontSize: typography.xl.fontSize,
            fontWeight: '700',
            textAlign: 'center',
          }}
        >
          Nova conversa
        </Text>
        <Text
          style={{
            color: colors.mutedForeground,
            fontSize: typography.sm.fontSize,
            textAlign: 'center',
          }}
        >
          Suas conversas aparecem aqui depois da primeira pergunta.
        </Text>
        <Pressable
          onPress={() => router.replace('/')}
          style={({ pressed }) => [
            {
              alignItems: 'center',
              backgroundColor: colors.brand,
              borderRadius: radius.full,
              justifyContent: 'center',
              minHeight: 52,
              marginTop: spacing.sm,
              opacity: pressed ? 0.85 : 1,
            },
          ]}
        >
          <Text
            style={{
              color: colors.brandForeground,
              fontSize: typography.base.fontSize,
              fontWeight: '700',
            }}
          >
            Fazer minha primeira pergunta
          </Text>
        </Pressable>
      </View>
    </View>
  );
}
