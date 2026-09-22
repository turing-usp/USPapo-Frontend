/** Auth group: login / register / reset over the scene, no chrome. */
import { Stack } from 'expo-router';
import React from 'react';

import { Backdrop, Tela } from '../../components/Cena';

export default function LayoutAutenticacao() {
  return (
    <>
      <Backdrop />
      <Stack
        screenLayout={({ children }) => <Tela>{children}</Tela>}
        screenOptions={{ headerShown: false, contentStyle: { backgroundColor: 'transparent' }, animation: 'none' }}
      />
    </>
  );
}
