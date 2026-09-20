/**
 * Auth group layout: plain stack with no chrome — the old app's auth routes
 * have no header, and the login screen renders its own centered branding.
 *
 * The backdrop is applied per screen via `screenLayout` (see components/Tela)
 * rather than once behind the stack, so each screen is opaque and the push
 * animation can actually cover the screen it is replacing.
 */
import { Stack } from 'expo-router';
import React from 'react';

import Cena from '../../components/Cena';
import Tela from '../../components/Tela';

export default function LayoutAutenticacao() {
  return (
    <Cena>
      <Stack
        screenLayout={({ children }) => <Tela>{children}</Tela>}
        screenOptions={{
          headerShown: false,
          // Tela paints the backdrop inside each screen, so the screen body
          // itself can stay transparent.
          contentStyle: { backgroundColor: 'transparent' },
          // The navigator does not animate: any transition it runs either
          // drags the backdrop along (slide) or shows both screens at once
          // (fade). Tela animates the incoming *content* instead, over a
          // backdrop that never moves. See components/Tela.
          animation: 'none',
        }}
      >
        <Stack.Screen name="login" />
        <Stack.Screen name="register" />
        <Stack.Screen name="reset" />
      </Stack>
    </Cena>
  );
}
