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
import { aplicarLinkDeRecuperacao } from '../lib/auth';
import { carregarHaptics } from '../lib/device';
import { supabase } from '../lib/supabase';
import { ThemeProvider, paleta, useTheme } from '../theme';

void SplashScreen.preventAutoHideAsync().catch(() => undefined);

// Web: keyboard focus rings every control in the brand orange (fields light their own edge).
// Desktop scrollbars share the theme's neutral ink; touch devices keep their native indicators.
if (Platform.OS === 'web' && typeof document !== 'undefined' && !document.getElementById('uspapo-foco')) {
  const estilo = Object.assign(document.createElement('style'), { id: 'uspapo-foco' });
  estilo.textContent = `:focus-visible{outline:2px solid ${paleta.laranja};outline-offset:2px}`
    + `input:focus-visible,textarea:focus-visible{outline:none}
      @media (hover: hover) and (pointer: fine) and (forced-colors: none) {
        * {
          scrollbar-width: thin;
          scrollbar-color: var(--uspapo-scroll-thumb, ${paleta.cinzaClaro}) transparent;
        }
        *:hover, *:focus-within {
          scrollbar-color: var(--uspapo-scroll-thumb-hover, ${paleta.cinzaClaro}) transparent;
        }
        /* Older WebKit/Chromium: the standard properties take precedence when supported. */
        @supports not (scrollbar-width: thin) {
          ::-webkit-scrollbar { width: 8px; height: 8px; }
          ::-webkit-scrollbar-track, ::-webkit-scrollbar-corner { background: transparent; }
          ::-webkit-scrollbar-thumb {
            background-color: var(--uspapo-scroll-thumb, ${paleta.cinzaClaro});
            background-clip: padding-box;
            border: 2px solid transparent;
            border-radius: 999px;
            min-height: 32px;
            min-width: 32px;
          }
          ::-webkit-scrollbar-thumb:hover, ::-webkit-scrollbar-thumb:active {
            background-color: var(--uspapo-scroll-thumb-hover, ${paleta.cinzaClaro});
          }
          ::-webkit-scrollbar-button { display: none; width: 0; height: 0; }
        }
      }`;
  document.head.appendChild(estilo);
}

// Web on phones: to show a focused field above the keyboard the browser moves the whole page up,
// and Chrome on Android may leave it there once the keyboard closes (its back gesture closes it
// without a blur): the app sat shifted up, its top cut and the page's background below it. The app
// never scrolls the page itself (its lists scroll inside), so with no keyboard up the page and the
// visual viewport go back to the top (scrollTo moves both).
if (Platform.OS === 'web' && typeof window !== 'undefined') {
  const vv = window.visualViewport;
  // A pinch-zoomed page is the reader's own doing: leave it alone.
  const tecladoAberto = () => !!vv && (vv.scale > 1.01 || window.innerHeight - vv.height > 120);
  const desrolar = () => {
    const deslocada = window.scrollX || window.scrollY || (vv ? Math.abs(vv.offsetTop) + Math.abs(vv.offsetLeft) > 0.5 : false);
    if (deslocada && !tecladoAberto()) window.scrollTo(0, 0);
  };
  const depois = () => setTimeout(desrolar, 80);
  window.addEventListener('scroll', desrolar, { passive: true });
  vv?.addEventListener('resize', depois);
  vv?.addEventListener('scroll', depois);
  document.addEventListener('focusout', depois);
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
  // A recovery link (web) opens its session first and goes straight to the new password.
  const [recuperar, setRecuperar] = useState(false);
  const segmentos = useSegments();
  const publico = segmentos[0] === '(auth)';

  useEffect(() => {
    let ativo = true;
    aplicarLinkDeRecuperacao()
      .then(async (recuperacao) => {
        const { data, error } = await supabase.auth.getSession();
        if (!ativo) return;
        setRecuperar(!!recuperacao);
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
  // Once on /reset, the link has done its job: the gate stops redirecting.
  const naRedefinicao = segmentos.at(-1) === 'reset';
  if (recuperar && naRedefinicao) setRecuperar(false);

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
  if (recuperar && !naRedefinicao) return <Redirect href="/reset" />;
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
