/**
 * Auth group layout: centered stack with the brand header (icon + "USPapo"
 * wordmark) above the screens, no tab bar.
 */
import { Stack } from 'expo-router';
import React from 'react';
import { Image, Text, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { useTheme } from '../../theme';

function CabecalhoDeMarca() {
  const { colors, spacing, typography } = useTheme();
  const insets = useSafeAreaInsets();
  return (
    <View
      style={{
        alignItems: 'center',
        backgroundColor: colors.canvas,
        paddingTop: insets.top + spacing.lg,
        paddingBottom: spacing.lg,
      }}
    >
      <View style={{ alignItems: 'center', gap: spacing.md }}>
        <Image
          source={require('../../assets/images/icon.png')}
          style={{ width: 44, height: 44, borderRadius: 12 }}
          accessibilityLabel="USPapo"
        />
        <Text
          style={{
            color: colors.brand,
            fontSize: typography['3xl'].fontSize,
            fontWeight: '800',
            letterSpacing: 0.5,
          }}
        >
          USPapo
        </Text>
      </View>
    </View>
  );
}

export default function LayoutAutenticacao() {
  const { colors } = useTheme();
  return (
    <View style={{ flex: 1, backgroundColor: colors.canvas }}>
      <CabecalhoDeMarca />
      <Stack
        screenOptions={{
          headerShown: false,
          contentStyle: { backgroundColor: colors.canvas },
        }}
      >
        <Stack.Screen name="login" />
        <Stack.Screen name="register" />
        <Stack.Screen name="reset" />
      </Stack>
    </View>
  );
}
