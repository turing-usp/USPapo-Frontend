/** Root: fonts, gestures, theme, and the session gate (no session outside (auth) -> /login). */
import { useFonts } from 'expo-font';
import { DarkTheme, DefaultTheme, Redirect, Stack, ThemeProvider as NavTheme, useSegments } from 'expo-router';
import * as SplashScreen from 'expo-splash-screen';
import { StatusBar } from 'expo-status-bar';
import React, { useEffect, useState, type ReactNode } from 'react';
import { ActivityIndicator, Platform, View } from 'react-native';
import { GestureHandlerRootView } from 'react-native-gesture-handler';

import { Backdrop } from '../components/Cena';
import { LogoUSPapo } from '../components/icons';
import { Botao, Texto } from '../components/ui';
import { carregarHaptics } from '../lib/device';
import { supabase } from '../lib/supabase';
import { ThemeProvider, paleta, useTheme } from '../theme';

void SplashScreen.preventAutoHideAsync().catch(() => undefined);

// Web: keyboard focus rings every control in the brand orange instead of the browser's own color
// (text fields light their own edge; see Campo).
if (Platform.OS === 'web' && typeof document !== 'undefined' && !document.getElementById('uspapo-foco')) {
  const estilo = Object.assign(document.createElement('style'), { id: 'uspapo-foco' });
  estilo.textContent = `:focus-visible{outline:2px solid ${paleta.laranja};outline-offset:2px}`
    + 'input:focus-visible,textarea:focus-visible{outline:none}';
  document.head.appendChild(estilo);
}

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
        <Botao rotulo="Tentar de novo" onPress={() => { setEstado('carregando'); setTentativa((n) => n + 1); }} />
      </Centro>
    );
  }
  if (!logado && !publico) return <Redirect href="/login" />;
  return <>{children}</>;
}

function Pilha() {
  const { colors, escuro } = useTheme();
  const base = escuro ? DarkTheme : DefaultTheme;
  // Transparent navigator theme: the canvas is painted by each group layout.
  return (
    <NavTheme value={{ ...base, colors: { ...base.colors, background: 'transparent' } }}>
      <StatusBar style={escuro ? 'light' : 'dark'} />
      <Stack screenOptions={{ headerShown: false, contentStyle: { backgroundColor: colors.canvas } }} />
    </NavTheme>
  );
}

export default function Raiz() {
  // The manual's fonts, subset to Latin, Greek and symbols (anything else falls back to the system font).
  // iOS gets a Changa with Latin vertical metrics: with the original (tall, for Arabic) ones, every
  // line shorter than them sat ~0.3 em high (assets/fonts/LEIAME.md).
  const [fontes, erro] = useFonts({
    'Changa-Medium': Platform.OS === 'ios' ? require('../assets/fonts/Changa-Medium-iOS.ttf') : require('../assets/fonts/Changa-Medium.ttf'),
    'MPLUS1p-Regular': require('../assets/fonts/MPLUS1p-Regular.ttf'),
    'MPLUS1p-Bold': require('../assets/fonts/MPLUS1p-Bold.ttf'),
    'RobotoMono-Regular': require('../assets/fonts/RobotoMono-Regular.ttf'),
  });
  useEffect(() => {
    void carregarHaptics();
  }, []);
  useEffect(() => {
    if (fontes || erro) void SplashScreen.hideAsync().catch(() => undefined);
  }, [fontes, erro]);
  if (!fontes && !erro) return null;
  return (
    <GestureHandlerRootView style={{ flex: 1 }}>
      <ThemeProvider>
        <PortaDeSessao>
          <Pilha />
        </PortaDeSessao>
      </ThemeProvider>
    </GestureHandlerRootView>
  );
}
