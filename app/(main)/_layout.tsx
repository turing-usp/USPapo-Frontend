/**
 * Main group: bottom tabs — Início (index), Chat (nested stack with the
 * "nova conversa" empty state + deep-linkable chat/[id]), Histórico, Ajustes.
 * Theme-aware tab colors come from the theme tokens.
 *
 * NOTE: no icon package is installed in this scaffold, and the typed
 * screen options of this expo-router version do not expose `icon` — real
 * tab-bar icons arrive with P8; tabs carry their titles only for now.
 */
import { Tabs } from 'expo-router';
import React from 'react';
import { View } from 'react-native';

import Backdrop from '../../components/Backdrop';
import { useTheme } from '../../theme';

type Aba = {
  name: 'index' | 'chat' | 'history' | 'settings';
  rotulo: string;
};

const ABAS: Aba[] = [
  { name: 'index', rotulo: 'Início' },
  { name: 'chat', rotulo: 'Chat' },
  { name: 'history', rotulo: 'Histórico' },
  { name: 'settings', rotulo: 'Ajustes' },
];

export default function LayoutPrincipal() {
  const { colors, glass } = useTheme();
  return (
    <View style={{ flex: 1 }}>
      {/* Old site's page backdrop (AppShell's .page-backdrop), behind the tabs. */}
      <Backdrop />
      <Tabs
        screenOptions={{
          headerShown: false,
          tabBarActiveTintColor: colors.brand,
          tabBarInactiveTintColor: colors.faintForeground,
          tabBarStyle: {
            // Glass chrome (old site): raised glass fill + hairline top edge
            // instead of the flat surface + solid line border.
            backgroundColor: glass.raised.backgroundColor,
            borderTopColor: glass.hairline.borderColor,
            borderTopWidth: glass.hairline.borderWidth ?? 1,
          },
        }}
      >
        {ABAS.map((aba) => (
          <Tabs.Screen key={aba.name} name={aba.name} options={{ title: aba.rotulo }} />
        ))}
      </Tabs>
    </View>
  );
}
