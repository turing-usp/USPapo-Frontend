/** Main group: the stack over the canvas, with the floating chrome blurring it; a drag to the right opens its drawer. */
import { Stack, useRouter } from 'expo-router';
import React, { useCallback, useEffect } from 'react';

import { Tela } from '../../components/Cena';
import Chrome, { ArrastarParaAbrir, useGaveta } from '../../components/Chrome';
import { CamadaDeVidro, CongelamentoDaTela } from '../../components/Glass';
import { registrarAparelho, useAbrirNotificacao } from '../../lib/notificacoes';

export default function LayoutPrincipal() {
  const router = useRouter();
  const gaveta = useGaveta();
  // Signed in: refresh this device's push token (no prompt here) and open tapped notifications.
  useEffect(() => {
    void registrarAparelho(false).catch(() => undefined);
  }, []);
  useAbrirNotificacao(useCallback((conversa: string) => router.push(`/chat/${conversa}`), [router]));
  return (
    <CongelamentoDaTela>
      <ArrastarParaAbrir gaveta={gaveta}>
        <CamadaDeVidro
          fundo={
            <Stack
              screenLayout={({ children }) => <Tela>{children}</Tela>}
              // No navigator animation: Tela animates the content over a still backdrop. iOS 26 would take
              // a swipe to the right anywhere as "back": that is the drawer's, and back keeps the left edge.
              screenOptions={{
                headerShown: false, contentStyle: { backgroundColor: 'transparent' }, animation: 'none', fullScreenGestureEnabled: false,
              }}
            />
          }
          frente={<Chrome gaveta={gaveta} />}
        />
      </ArrastarParaAbrir>
    </CongelamentoDaTela>
  );
}
