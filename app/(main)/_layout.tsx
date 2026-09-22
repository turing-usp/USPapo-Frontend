/** Main group: the stack over the scene, with the floating chrome blurring it. */
import { Stack } from 'expo-router';
import React from 'react';

import { Tela } from '../../components/Cena';
import Chrome from '../../components/Chrome';
import { CamadaDeVidro } from '../../components/Glass';

export default function LayoutPrincipal() {
  return (
    <CamadaDeVidro
      fundo={
        <Stack
          screenLayout={({ children }) => <Tela>{children}</Tela>}
          // No navigator animation: Tela animates the content over a still backdrop.
          screenOptions={{ headerShown: false, contentStyle: { backgroundColor: 'transparent' }, animation: 'none' }}
        />
      }
      frente={<Chrome />}
    />
  );
}
