/**
 * Chat: nested stack with the "nova conversa" empty state (index) and the
 * deep-linkable conversation screen ([id]).
 *
 * Deep links: `usapo://chat/<id>` (native) and `https://uspapo.turingusp.com/chat/<id>`
 * (web) both resolve to this [id] route — groups are invisible in URLs.
 */
import { Stack } from 'expo-router';
import React from 'react';

export default function LayoutChat() {
  return (
    <Stack
      screenOptions={{
        headerShown: false,
        // Transparent: the group layout already paints the shared backdrop,
        // and an opaque canvas here would cover it.
        contentStyle: { backgroundColor: 'transparent' },
      }}
    >
      <Stack.Screen name="index" />
      <Stack.Screen name="[id]" />
    </Stack>
  );
}
