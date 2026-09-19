/**
 * Chat tab: nested stack with the "nova conversa" empty state (index) and
 * the deep-linkable conversation screen ([id]).
 *
 * Deep links: `usapo://chat/<id>` (native) and `https://uspapo.turingusp.com/chat/<id>`
 * (web) both resolve to this [id] route — groups are invisible in URLs.
 */
import { Stack } from 'expo-router';
import React from 'react';

import { useTheme } from '../../../theme';

export default function LayoutChat() {
  const { colors } = useTheme();
  return (
    <Stack
      screenOptions={{
        headerShown: false,
        contentStyle: { backgroundColor: colors.canvas },
      }}
    >
      <Stack.Screen name="index" />
      <Stack.Screen name="[id]" />
    </Stack>
  );
}
