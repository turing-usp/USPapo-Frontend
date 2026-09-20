/**
 * Root layout: ThemeProvider + SessionGate + the three route groups.
 *
 * SessionGate (plan §9 "session gate with skeleton + retry"):
 * - undecided → full-screen pulsing brand skeleton;
 * - session error → "Não foi possível carregar sua sessão" + "Tentar novamente";
 * - ready, no session and a non-public route → <Redirect> to /(auth)/login;
 * - public group: (auth)/*.
 */
import { useFonts } from 'expo-font';
import * as SplashScreen from 'expo-splash-screen';
import { Redirect, Stack, useSegments } from 'expo-router';
import { StatusBar } from 'expo-status-bar';
import React, { useCallback, useEffect, useRef, useState, type ReactNode } from 'react';
import {
  Animated,
  Easing,
  Image,
  Pressable,
  StyleSheet,
  Text,
  View,
} from 'react-native';

import { carregarPreferencia } from '../lib/haptics';
import { supabase } from '../lib/supabase';
import { ThemeProvider, fonts, useTheme } from '../theme';
import Glass from '../components/Glass';

type StatusSessao = 'carregando' | 'falhou' | 'pronta';

/**
 * Full-screen brand skeleton shown while the Supabase session is being read.
 * The brand block pulses (opacity loop) so the app reads as "alive", not
 * stuck — the skeleton→content transition is part of the smoothness spec.
 */
function EsqueletoDeSessao() {
  const { colors, spacing, typography } = useTheme();
  const pulso = useRef(new Animated.Value(0.35)).current;

  useEffect(() => {
    const animacao = Animated.loop(
      Animated.sequence([
        Animated.timing(pulso, {
          toValue: 1,
          duration: 700,
          easing: Easing.inOut(Easing.ease),
          useNativeDriver: true,
        }),
        Animated.timing(pulso, {
          toValue: 0.35,
          duration: 700,
          easing: Easing.inOut(Easing.ease),
          useNativeDriver: true,
        }),
      ]),
    );
    animacao.start();
    return () => animacao.stop();
  }, [pulso]);

  return (
    <View style={[styles.telaInteira, { backgroundColor: colors.canvas }]}>
      <Animated.View
        style={[
          styles.marcaCentro,
          { gap: spacing.md, opacity: pulso },
        ]}
      >
        <Image
          source={require('../assets/images/icon.png')}
          style={styles.marcaImagem}
          accessibilityLabel="USPapo"
        />
        <Text
          style={[
            styles.marcaNome,
            {
              color: colors.brand,
              fontFamily: fonts.displayBold,
              fontSize: typography['3xl'].fontSize,
            },
          ]}
        >
          USPapo
        </Text>
        <Text
          style={[
            styles.marcaStatus,
            {
              color: colors.mutedForeground,
              fontFamily: fonts.body,
              fontSize: typography.sm.fontSize,
            },
          ]}
        >
          Carregando…
        </Text>
      </Animated.View>
    </View>
  );
}

/**
 * The "Falhou" screen: the session could not be read (storage corruption,
 * auth API down…). One explicit retry — no silent auto-retry loop.
 */
function TelaSessaoFalhou({ aoTentarNovamente }: { aoTentarNovamente: () => void }) {
  const { colors, radius, spacing, typography } = useTheme();
  return (
    <View style={[styles.telaInteira, { backgroundColor: colors.canvas }]}>
      <Glass
        radius={radius.xl}
        style={{
            alignItems: 'center',
            gap: spacing.lg,
            padding: spacing['2xl'],
            width: '85%',
        }}
      >
        <Text
          style={[
            styles.tituloCentro,
            {
              color: colors.foreground,
              fontFamily: fonts.displayBold,
              fontSize: typography.lg.fontSize,
            },
          ]}
        >
          Não foi possível carregar sua sessão
        </Text>
        <Text
          style={[
            styles.textoCentro,
            {
              color: colors.mutedForeground,
              fontFamily: fonts.body,
              fontSize: typography.sm.fontSize,
            },
          ]}
        >
          Verifique sua conexão e tente de novo.
        </Text>
        <Pressable
          onPress={aoTentarNovamente}
          style={({ pressed }) => [
            styles.botao,
            {
              backgroundColor: colors.brand,
              borderRadius: radius.full,
              opacity: pressed ? 0.85 : 1,
            },
          ]}
        >
          <Text
            style={[
              styles.botaoTexto,
              {
              color: colors.brandForeground,
              fontFamily: fonts.bodyBold,
              fontSize: typography.base.fontSize,
            },
            ]}
          >
            Tentar novamente
          </Text>
        </Pressable>
            </Glass>
    </View>
  );
}

/**
 * Reads the Supabase session once (and follows sign-in/sign-out afterwards)
 * and decides what the tree below may render. `tentativa` is the retry key:
 * bumping it re-runs the effect, re-reading the session from storage.
 */
function PortaDeSessao({ children }: { children: ReactNode }) {
  const [status, setStatus] = useState<StatusSessao>('carregando');
  const [temSessao, setTemSessao] = useState(false);
  const [tentativa, setTentativa] = useState(0);
  const segmentos = useSegments();

  useEffect(() => {
    let ativo = true;
    supabase.auth
      .getSession()
      .then(({ data, error }) => {
        if (!ativo) return;
        if (error) {
          setStatus('falhou');
          return;
        }
        setTemSessao(Boolean(data.session));
        setStatus('pronta');
      })
      .catch(() => {
        if (ativo) setStatus('falhou');
      });

    // Follow sign-in (login screen) / sign-out so the gate re-evaluates
    // without a full reload.
    const { data: assinatura } = supabase.auth.onAuthStateChange((_evento, nova) => {
      if (!ativo) return;
      setTemSessao(Boolean(nova));
    });

    return () => {
      ativo = false;
      assinatura.subscription.unsubscribe();
    };
  }, [tentativa]);

  const tentarNovamente = useCallback(() => {
    setStatus('carregando');
    setTentativa((n) => n + 1);
  }, []);

  if (status === 'carregando') return <EsqueletoDeSessao />;
  if (status === 'falhou') {
    return <TelaSessaoFalhou aoTentarNovamente={tentarNovamente} />;
  }

  // Public group: the auth screens are reachable without a session.
  const grupoAtual = segmentos[0];
  const ehPublico = grupoAtual === '(auth)';
  if (!temSessao && !ehPublico) {
    return <Redirect href="/(auth)/login" />;
  }

  return <>{children}</>;
}

function PilhaRaiz() {
  const { colors } = useTheme();
  return (
    <Stack
      screenOptions={{
        headerShown: false,
        contentStyle: { backgroundColor: colors.canvas },
      }}
    >
      <Stack.Screen name="(auth)" />
      <Stack.Screen name="(main)" />
      <Stack.Screen name="(admin)" />
    </Stack>
  );
}

export default function Raiz() {
  // The old site's families (theme `fonts`). Bold is a separate face because
  // React Native selects by family name instead of synthesising weight.
  const [fontesProntas, erroDeFonte] = useFonts({
    Roboto: require('../assets/fonts/Roboto-Regular.ttf'),
    'Roboto-Bold': require('../assets/fonts/Roboto-Bold.ttf'),
    Geom: require('../assets/fonts/Geom-Regular.ttf'),
    'Geom-Bold': require('../assets/fonts/Geom-Bold.ttf'),
    Orbitron: require('../assets/fonts/Orbitron-Regular.ttf'),
    'Orbitron-Bold': require('../assets/fonts/Orbitron-Bold.ttf'),
  });

  useEffect(() => {
    // Apply the saved haptics preference before the first interaction, so a
    // user who turned vibration off never feels it once on a cold start.
    void carregarPreferencia();
  }, []);

  useEffect(() => {
    // The native splash screen stays up until the router tree is ready and
    // the brand faces are in memory, so no screen renders in a fallback face
    // and then reflows. A font failure is not fatal: the system faces still
    // read, so the gate is allowed to take over anyway.
    if (fontesProntas || erroDeFonte) void SplashScreen.hideAsync();
  }, [fontesProntas, erroDeFonte]);

  if (!fontesProntas && !erroDeFonte) return null;

  return (
    <ThemeProvider>
      <StatusBar style="auto" />
      <PortaDeSessao>
        <PilhaRaiz />
      </PortaDeSessao>
    </ThemeProvider>
  );
}

const styles = StyleSheet.create({
  telaInteira: { flex: 1, alignItems: 'center', justifyContent: 'center' },
  marcaCentro: { alignItems: 'center' },
  marcaImagem: {
    width: 72,
    height: 72,
    borderRadius: 20,
  },
  marcaNome: { letterSpacing: 0.5 },
  marcaStatus: { marginTop: 2 },
  tituloCentro: { textAlign: 'center' },
  textoCentro: { textAlign: 'center' },
  botao: {
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: 14,
    paddingHorizontal: 24,
    minWidth: 200,
  },
  botaoTexto: {},
});
