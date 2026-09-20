/**
 * Auth group layout: plain stack with no chrome — the old app's auth routes
 * have no header, and the login screen renders its own centered branding.
 * The scene backdrop is the first child, behind the screens.
 */
import { Stack } from 'expo-router';
import React from 'react';

import Backdrop from '../../components/Backdrop';

export default function LayoutAutenticacao() {
  return (
    <>
      <Backdrop />
      <Stack
        screenOptions={{
          headerShown: false,
          // Transparent so the scene backdrop shows through the screens.
          contentStyle: { backgroundColor: 'transparent' },
        }}
      >
        <Stack.Screen name="login" />
        <Stack.Screen name="register" />
        <Stack.Screen name="reset" />
      </Stack>
    </>
  );
}
