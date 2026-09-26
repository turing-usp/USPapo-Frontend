/** Main group: the stack over the scene, with the floating chrome blurring it. */
import { Stack, useRouter } from 'expo-router';
import React, { useCallback, useEffect } from 'react';

import { Tela } from '../../components/Cena';
import Chrome from '../../components/Chrome';
import { CamadaDeVidro } from '../../components/Glass';
import { registrarAparelho, useAbrirNotificacao } from '../../lib/notificacoes';

export default function LayoutPrincipal() {
  const router = useRouter();
  // Signed in: refresh this device's push token (no prompt here) and open tapped notifications.
  useEffect(() => {
    void registrarAparelho(false).catch(() => undefined);
  }, []);
  useAbrirNotificacao(useCallback((conversa: string) => router.push(`/chat/${conversa}`), [router]));
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
