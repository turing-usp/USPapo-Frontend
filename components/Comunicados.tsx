/**
 * Announcements (lib/comunicados.ts) in the floating chrome: a giant glass pop-up (a novidade opens
 * by itself once; an aviso opens from its pill) and the aviso pill between the menu and the avatar.
 * They live in the chrome so the pop-up blurs the whole screen behind it.
 */
import React, { useCallback, useEffect, useState } from 'react';
import {
  Animated, AppState, BackHandler, Easing, Image, Platform, Pressable, ScrollView, StyleSheet, View, useWindowDimensions,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import Resposta from './chat/Resposta';
import Glass from './Glass';
import { Icone } from './icons';
import { Botao, Texto } from './ui';
import { escolher, lerComunicados, lerVistos, marcarVisto, urlDaImagem, type Comunicado } from '../lib/comunicados';
import { haptics } from '../lib/device';
import { useTheme } from '../theme';

const RELER_AO_VOLTAR_MS = 30_000;
const RELER_MS = 2 * 60_000;

/**
 * The announcements in force, re-read on start, when the app comes back and every 2 minutes, so a
 * withdrawn one leaves quickly: its pill goes and its open pop-up closes.
 */
export function useComunicados() {
  const [novidade, setNovidade] = useState<Comunicado | null>(null);
  const [aviso, setAviso] = useState<Comunicado | null>(null);
  const [aberto, setAberto] = useState<Comunicado | null>(null);
  const [emVigor, setEmVigor] = useState<string[]>([]);

  useEffect(() => {
    let ativo = true;
    let ultima = 0;
    const carregar = async () => {
      ultima = Date.now();
      const lista = await lerComunicados();
      if (!ativo || !lista) return;
      const escolhidos = escolher(lista, await lerVistos());
      if (!ativo) return;
      setNovidade(escolhidos.novidade);
      setAviso(escolhidos.aviso);
      setEmVigor(lista.map((c) => c.id));
    };
    void carregar();
    const sub = AppState.addEventListener('change', (estado) => {
      if (estado === 'active' && Date.now() - ultima > RELER_AO_VOLTAR_MS) void carregar();
    });
    const timer = setInterval(() => {
      if (AppState.currentState === 'active') void carregar();
    }, RELER_MS);
    return () => {
      ativo = false;
      sub.remove();
      clearInterval(timer);
    };
  }, []);

  // A novidade opens by itself once the screen has settled; it counts as seen as soon as it opens.
  useEffect(() => {
    if (!novidade || aberto) return;
    const timer = setTimeout(() => {
      setAberto(novidade);
      setNovidade(null);
      void marcarVisto(novidade.id);
    }, 700);
    return () => clearTimeout(timer);
  }, [novidade, aberto]);

  const ocultarAviso = useCallback(() => {
    if (!aviso) return;
    void marcarVisto(aviso.id);
    setAviso(null);
    setAberto(null);
  }, [aviso]);

  // A withdrawn announcement closes even while open.
  const visivel = aberto && emVigor.includes(aberto.id) ? aberto : null;
  return { aviso, aberto: visivel, abrir: setAberto, fechar: () => setAberto(null), ocultarAviso };
}

/** The aviso pill. Android keeps it unblurred: each Android blur redraws the screen every frame. */
export function PilulaAviso({ aviso, aoAbrir }: { aviso: Comunicado; aoAbrir: () => void }) {
  const { colors, radius, spacing } = useTheme();
  const [pulso] = useState(() => new Animated.Value(1));
  useEffect(() => {
    const loop = Animated.loop(Animated.sequence([
      Animated.timing(pulso, { toValue: 0.35, duration: 900, easing: Easing.inOut(Easing.ease), useNativeDriver: true }),
      Animated.timing(pulso, { toValue: 1, duration: 900, easing: Easing.inOut(Easing.ease), useNativeDriver: true }),
    ]));
    loop.start();
    return () => loop.stop();
  }, [pulso]);
  return (
    <Glass desfoque={Platform.OS !== 'android'} variante={Platform.OS === 'android' ? 'raised' : 'surface'} radius={radius.full}
      onPress={() => { void haptics.selection(); aoAbrir(); }} accessibilityLabel={`Aviso: ${aviso.pilula}. Toque para saber mais.`}
      style={[styles.pilula, { gap: spacing.sm, paddingHorizontal: spacing.md }]}>
      <Animated.View style={[styles.ponto, { backgroundColor: colors.brand, opacity: pulso }]} />
      <Texto v="suave" cor={colors.foreground} numberOfLines={1} style={{ flexShrink: 1 }}>{aviso.pilula}</Texto>
    </Glass>
  );
}

function Imagem({ uri }: { uri: string }) {
  const { radius } = useTheme();
  const [proporcao, setProporcao] = useState(16 / 9);
  return (
    <Image source={{ uri }} accessibilityIgnoresInvertColors resizeMode="cover"
      onLoad={(e) => {
        const { width, height } = e.nativeEvent.source ?? {};
        if (width && height) setProporcao(width / height);
      }}
      style={{ width: '100%', aspectRatio: proporcao, borderRadius: radius.lg }} />
  );
}

/** The giant glass pop-up: images, title and Markdown text; an aviso can also be hidden from here. */
export function VidroGigante({ comunicado, aoFechar, aoOcultar }: {
  comunicado: Comunicado | null; aoFechar: () => void; aoOcultar: () => void;
}) {
  const { colors, fonts, radius, spacing, typography } = useTheme();
  const insets = useSafeAreaInsets();
  const { width, height } = useWindowDimensions();
  const [entrada] = useState(() => new Animated.Value(0));
  // The last content stays on screen while it fades out.
  const [atual, setAtual] = useState<Comunicado | null>(comunicado);
  if (comunicado && comunicado !== atual) setAtual(comunicado);

  useEffect(() => {
    Animated.timing(entrada, {
      toValue: comunicado ? 1 : 0, duration: comunicado ? 260 : 180, useNativeDriver: true,
      easing: comunicado ? Easing.out(Easing.cubic) : Easing.in(Easing.cubic),
    }).start(({ finished }) => finished && !comunicado && setAtual(null));
  }, [comunicado, entrada]);

  useEffect(() => {
    if (!comunicado) return;
    const sub = BackHandler.addEventListener('hardwareBackPress', () => {
      aoFechar();
      return true;
    });
    return () => sub.remove();
  }, [comunicado, aoFechar]);

  if (!atual) return null;
  const escala = entrada.interpolate({ inputRange: [0, 1], outputRange: [0.96, 1] });
  return (
    <View pointerEvents={comunicado ? 'auto' : 'none'} style={[StyleSheet.absoluteFill, styles.camada]}>
      <Animated.View style={[StyleSheet.absoluteFill, { opacity: entrada }]}>
        <Pressable accessibilityLabel="Fechar" onPress={aoFechar} style={[StyleSheet.absoluteFill, { backgroundColor: colors.scrim + '59' }]} />
      </Animated.View>
      <Animated.View pointerEvents="box-none" style={[styles.centro, {
        paddingTop: insets.top + spacing.lg, paddingBottom: insets.bottom + spacing.lg, paddingHorizontal: spacing.lg,
        opacity: entrada, transform: [{ scale: escala }],
      }]}>
        <Glass desfoque variante="panel" radius={radius.xl}
          style={{ width: '100%', maxWidth: 560, maxHeight: height - insets.top - insets.bottom - 2 * spacing.lg }}>
          <ScrollView contentContainerStyle={{ gap: spacing.lg, padding: width >= 640 ? spacing['3xl'] : spacing.xl }}>
            <View style={{ flexDirection: 'row', alignItems: 'flex-start', gap: spacing.md }}>
              <Texto style={{ flex: 1, fontFamily: fonts.displayBold, ...typography['2xl'] }}>{atual.titulo}</Texto>
              <Pressable accessibilityRole="button" accessibilityLabel="Fechar" hitSlop={10} onPress={aoFechar}>
                <Icone nome="fechar" cor={colors.mutedForeground} tamanho={24} />
              </Pressable>
            </View>
            {atual.imagens.map((caminho) => <Imagem key={caminho} uri={urlDaImagem(caminho)} />)}
            {atual.texto.trim() ? <View><Resposta texto={atual.texto} streaming={false} /></View> : null}
            <View style={{ gap: spacing.sm }}>
              <Botao rotulo={atual.tipo === 'aviso' ? 'Fechar' : 'Entendi'} onPress={aoFechar} />
              {atual.tipo === 'aviso' ? <Botao v="secundario" rotulo="Ocultar este aviso" onPress={aoOcultar} /> : null}
            </View>
          </ScrollView>
        </Glass>
      </Animated.View>
    </View>
  );
}

const styles = StyleSheet.create({
  pilula: { flexDirection: 'row', alignItems: 'center', height: 40, maxWidth: '100%' },
  ponto: { width: 8, height: 8, borderRadius: 4 },
  camada: { zIndex: 50 },
  centro: { position: 'absolute', top: 0, right: 0, bottom: 0, left: 0, alignItems: 'center', justifyContent: 'center' },
});
