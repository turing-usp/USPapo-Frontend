/**
 * Admin group layout: the web-only guard.
 *
 * The analytics/feedback screens exist only in the web build (the panel is
 * an operator surface behind the Cloudflare proxy; students use the mobile
 * app). On native platforms the group redirects to the home screen instead
 * of mounting the screens. Web sessions pass the root SessionGate as any
 * other non-public route (login first, then the panel; the panel itself
 * authenticates against the backend with the admin key).
 */
import { Redirect, Stack } from 'expo-router';
import React from 'react';
import { Platform, View } from 'react-native';

import { useTheme } from '../../theme';

export default function LayoutAdmin() {
  const { colors } = useTheme();

  // Web-only guard: native → back to the app.
  if (Platform.OS !== 'web') {
    return <Redirect href="/" />;
  }

  return (
    <View style={{ flex: 1, backgroundColor: colors.canvas }}>
      <Stack
        screenOptions={{
          headerShown: false,
          contentStyle: { backgroundColor: colors.canvas },
        }}
      >
        <Stack.Screen name="analytics" />
        <Stack.Screen name="feedback" />
      </Stack>
    </View>
  );
}
