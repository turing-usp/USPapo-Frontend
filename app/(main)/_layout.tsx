/**
 * Main group. The old site has no tab bar: the backdrop covers the viewport,
 * the screens stack on top of it, and the only navigation surface is the
 * floating chrome (hamburger → glass drawer, account avatar). This layout is
 * that arrangement — <Backdrop /> once, a transparent Stack over it, and
 * <Chrome /> floating above both.
 */
import { Stack } from 'expo-router';
import React from 'react';
import { View } from 'react-native';

import Cena from '../../components/Cena';
import Chrome from '../../components/Chrome';
import Tela from '../../components/Tela';

export default function LayoutPrincipal() {
  return (
    <Cena>
      <Stack
        screenLayout={({ children }) => <Tela>{children}</Tela>}
        screenOptions={{
          headerShown: false,
          // Tela paints the old .page-backdrop inside each screen, which is
          // what keeps the screen opaque during a push.
          contentStyle: { backgroundColor: 'transparent' },
          // The navigator does not animate: any transition it runs either
          // drags the backdrop along (slide) or shows both screens at once
          // (fade). Tela animates the incoming *content* instead, over a
          // backdrop that never moves. See components/Tela.
          animation: 'none',
        }}
      >
        <Stack.Screen name="index" />
        <Stack.Screen name="chat" />
        <Stack.Screen name="history" />
        <Stack.Screen name="settings" />
      </Stack>
      <Chrome />
    </Cena>
  );
}
