/** Root: fonts, theme, and the session gate (no session outside (auth) -> /login). */
import { useFonts } from 'expo-font';
import { DarkTheme, DefaultTheme, Redirect, Stack, ThemeProvider as NavTheme, useSegments } from 'expo-router';
import * as SplashScreen from 'expo-splash-screen';
import { StatusBar } from 'expo-status-bar';
import React, { useEffect, useState, type ReactNode } from 'react';
import { ActivityIndicator, View } from 'react-native';

import { Backdrop } from '../components/Cena';
import { LogoUSPapo } from '../components/icons';
import { Botao, Texto } from '../components/ui';
import { carregarHaptics } from '../lib/device';
import { supabase } from '../lib/supabase';
import { ThemeProvider, useTheme } from '../theme';

void SplashScreen.preventAutoHideAsync().catch(() => undefined);

function Centro({ children }: { children: ReactNode }) {
  const { spacing } = useTheme();
  return (
    <View style={{ flex: 1, alignItems: 'center', justifyContent: 'center', gap: spacing.md, padding: spacing.xl }}>
      <Backdrop />
      {children}
    </View>
  );
}

function PortaDeSessao({ children }: { children: ReactNode }) {
  const { colors } = useTheme();
  const [estado, setEstado] = useState<'carregando' | 'falhou' | 'pronta'>('carregando');
  const [logado, setLogado] = useState(false);
  const [tentativa, setTentativa] = useState(0);
  const publico = useSegments()[0] === '(auth)';

  useEffect(() => {
    let ativo = true;
    supabase.auth.getSession()
      .then(({ data, error }) => {
        if (!ativo) return;
        setLogado(!!data.session);
        setEstado(error ? 'falhou' : 'pronta');
      })
      .catch(() => ativo && setEstado('falhou'));
    const { data } = supabase.auth.onAuthStateChange((_e, sessao) => ativo && setLogado(!!sessao));
    return () => {
      ativo = false;
      data.subscription.unsubscribe();
    };
  }, [tentativa]);

  if (estado === 'carregando') {
    return <Centro><LogoUSPapo size={64} /><ActivityIndicator color={colors.brand} /></Centro>;
  }
  if (estado === 'falhou') {
    return (
      <Centro>
        <Texto v="subtitulo" centro>Não foi possível carregar sua sessão</Texto>
        <Texto v="suave" centro>Verifique sua conexão e tente de novo.</Texto>
        <Botao rotulo="Tentar novamente" onPress={() => { setEstado('carregando'); setTentativa((n) => n + 1); }} />
      </Centro>
    );
  }
  if (!logado && !publico) return <Redirect href="/login" />;
  return <>{children}</>;
}

function Pilha() {
  const { colors, scheme } = useTheme();
  const base = scheme === 'dark' ? DarkTheme : DefaultTheme;
  // Transparent navigator theme: the scene is painted by each group layout.
  return (
    <NavTheme value={{ ...base, colors: { ...base.colors, background: 'transparent' } }}>
      <StatusBar style={scheme === 'dark' ? 'light' : 'dark'} />
      <Stack screenOptions={{ headerShown: false, contentStyle: { backgroundColor: colors.canvas } }} />
    </NavTheme>
  );
}

export default function Raiz() {
  const [fontes, erro] = useFonts({
    Roboto: require('../assets/fonts/Roboto-Regular.ttf'),
    'Roboto-Bold': require('../assets/fonts/Roboto-Bold.ttf'),
    Geom: require('../assets/fonts/Geom-Regular.ttf'),
    'Geom-Bold': require('../assets/fonts/Geom-Bold.ttf'),
    Orbitron: require('../assets/fonts/Orbitron-Regular.ttf'),
  });
  useEffect(() => {
    void carregarHaptics();
  }, []);
  useEffect(() => {
    if (fontes || erro) void SplashScreen.hideAsync().catch(() => undefined);
  }, [fontes, erro]);
  if (!fontes && !erro) return null;
  return (
    <ThemeProvider>
      <PortaDeSessao>
        <Pilha />
      </PortaDeSessao>
    </ThemeProvider>
  );
}
