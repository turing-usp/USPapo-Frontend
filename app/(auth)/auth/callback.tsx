/**
 * Native: where Google's deep link (`uspapofe://auth/callback?code=…`) lands as a route. Usually
 * the login screen is still waiting for it (lib/auth's entrarComGoogle finishes the sign-in) and
 * this screen steps aside; if the system had closed the app while the browser was open, nobody is
 * waiting and this screen finishes the sign-in itself. On the web it only sends to the start.
 */
import * as Linking from 'expo-linking';
import { useRouter } from 'expo-router';
import React, { useEffect, useState } from 'react';
import { ActivityIndicator, Platform } from 'react-native';

import { Botao, ColunaCentral, Erro } from '../../../components/ui';
import { concluirGoogle } from '../../../lib/auth';
import { useTheme } from '../../../theme';

export default function RetornoDoGoogle() {
  const router = useRouter();
  const { colors } = useTheme();
  const url = Linking.useLinkingURL();
  const [erro, setErro] = useState<string | null>(null);

  useEffect(() => {
    if (Platform.OS === 'web') {
      router.replace('/');
      return;
    }
    if (!url) return;
    let ativo = true;
    void concluirGoogle(url).then((r) => {
      if (!ativo) return;
      if (r === null) {
        if (router.canGoBack()) router.back();
        else router.replace('/login');
      } else if (r.ok) router.replace('/');
      else if (r.cancelado) router.replace('/login');
      else setErro(r.mensagem ?? 'Não foi possível entrar com o Google. Tente de novo.');
    });
    return () => {
      ativo = false;
    };
  }, [url, router]);

  return (
    <ColunaCentral>
      {erro ? (
        <>
          <Erro centro>{erro}</Erro>
          <Botao rotulo="Voltar para o login" onPress={() => router.replace('/login')} />
        </>
      ) : <ActivityIndicator color={colors.brand} />}
    </ColunaCentral>
  );
}
