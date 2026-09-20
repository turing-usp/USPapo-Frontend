/**
 * "Nova conversa" — the Chat tab empty state (no saved conversations yet;
 * P9 lists the local cache here).
 */
import { useRouter } from 'expo-router';
import React from 'react';
import { Pressable, Text, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { fonts, useTheme } from '../../../theme';
import Glass from '../../../components/Glass';

export default function NovaConversa() {
  const { colors, radius, spacing, typography } = useTheme();
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
      <Glass
        radius={radius.xl}
        style={{
            alignItems: 'center',
            gap: spacing.md,
            padding: spacing['2xl'],
            width: '100%',
        }}
      >
        <Text
          style={{
            color: colors.foreground,
            fontFamily: fonts.displayBold,
            fontSize: typography.xl.fontSize,
            textAlign: 'center',
          }}
        >
          Nova conversa
        </Text>
        <Text
          style={{
            color: colors.mutedForeground,
            fontFamily: fonts.body,
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
              fontFamily: fonts.bodyBold,
              fontSize: typography.base.fontSize,
            }}
          >
            Fazer minha primeira pergunta
          </Text>
        </Pressable>
            </Glass>
    </View>
  );
}
