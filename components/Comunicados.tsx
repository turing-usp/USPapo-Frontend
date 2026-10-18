/**
 * Announcements (lib/comunicados.ts) in the floating chrome: a giant glass pop-up (a novidade opens
 * by itself once; an aviso opens from its pill) and the aviso pill between the menu and the avatar.
 * They live in the chrome, over every screen; the pop-up is opaque glass (no blur over the whole screen).
 */
import React, { useCallback, useEffect, useState } from 'react';
import {
  AppState, BackHandler, Image, Platform, Pressable, ScrollView, StyleSheet, View, useWindowDimensions,
} from 'react-native';
import Reanimated, {
  Easing, cancelAnimation, runOnJS, useAnimatedStyle, useDerivedValue, useSharedValue, withSequence, withSpring, withTiming,
} from 'react-native-reanimated';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import Resposta from './chat/Resposta';
import Glass, { useCongelarTela } from './Glass';
import { pulsar, useSurgimento, type Movimento } from './Movimento';
import { Botao, BotaoDeIcone, Texto } from './ui';
import { escolher, lerComunicados, lerVistos, marcarVisto, urlDaImagem, type Comunicado } from '../lib/comunicados';
import { haptics } from '../lib/device';
import { alfa, useTheme } from '../theme';

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

const ENTRE_RESPIROS_MS = 20_000;
const RESPIRO = { duration: 900, easing: Easing.inOut(Easing.ease) };

/**
 * The aviso pill, in the same glass as the menu button beside it: it pops in when it appears. Its
 * dot breathes once then and again every 20 s, and the pill swells and bounces back as the dot
 * lights up again; it rests in between: each frame of the breath redraws every blurred pane on
 * Android, and a nonstop loop kept a still screen redrawing at ~60 fps.
 */
export function PilulaAviso({ aviso, aoAbrir }: { aviso: Comunicado; aoAbrir: () => void }) {
  const { colors, radius, spacing } = useTheme();
  const ponto = useSharedValue(1);
  const inchaco = useSharedValue(1);
  const surgimento = useSurgimento(true, { de: 0.7 });
  const entrada = surgimento.movimento.escala;
  const escala = useDerivedValue(() => (entrada?.value ?? 1) * inchaco.value);
  const [movimento] = useState<Movimento>(() => ({ opacidade: surgimento.movimento.opacidade, escala }));
  useEffect(() => {
    let timer: ReturnType<typeof setTimeout> | undefined;
    const respirar = () => {
      ponto.set(withSequence(withTiming(0.35, RESPIRO), withTiming(1, RESPIRO)));
      pulsar(inchaco, 1.06, RESPIRO.duration);
      timer = setTimeout(respirar, 2 * RESPIRO.duration + ENTRE_RESPIROS_MS);
    };
    respirar();
    return () => {
      clearTimeout(timer);
      cancelAnimation(ponto);
      cancelAnimation(inchaco);
      ponto.set(1);
      inchaco.set(1);
    };
  }, [ponto, inchaco, aviso.id]);
  const brilho = useAnimatedStyle(() => ({ opacity: ponto.value }));
  return (
    <Glass desfoque radius={radius.full} movimento={movimento} aperto={0.95}
      onPress={() => { void haptics.selection(); aoAbrir(); }} accessibilityLabel={`Aviso: ${aviso.pilula}. Toque para saber mais.`}
      style={[styles.pilula, { gap: spacing.sm, paddingHorizontal: spacing.md }]}>
      <Reanimated.View style={[styles.ponto, { backgroundColor: colors.brand }, brilho]} />
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

/** Room around the giant glass for its shadow, inside its Android texture (see below). */
const SOMBRA = 16;
/** The giant glass's pop: gentler than a menu's, ~1% past full size. */
const MOLA_GRANDE = { damping: 16, stiffness: 380, mass: 0.8 } as const;
const DE = 0.94;

/** The giant glass pop-up: images, title and Markdown text; an aviso can also be hidden from here. */
export function VidroGigante({ comunicado, aoFechar, aoOcultar }: {
  comunicado: Comunicado | null; aoFechar: () => void; aoOcultar: () => void;
}) {
  const { colors, radius, spacing } = useTheme();
  const insets = useSafeAreaInsets();
  const { width, height } = useWindowDimensions();
  const entrada = useSharedValue(0);
  const escala = useSharedValue(DE);
  // The last content stays on screen while it leaves.
  const [atual, setAtual] = useState<Comunicado | null>(comunicado);
  if (comunicado && comunicado !== atual) setAtual(comunicado);
  // The pop starts a frame after the content's first layout: mounting a page of Markdown (and the
  // blur's first draw) takes a few long frames, which would swallow its start.
  const [medido, setMedido] = useState(false);
  // While it scales, Android draws it from one GPU texture (a page of text scaled every frame
  // re-rasterized every glyph each frame); the texture has room for the shadow around the glass.
  const [animando, setAnimando] = useState(false);
  const [rumo, setRumo] = useState(comunicado);
  if (comunicado !== rumo) {
    setRumo(comunicado);
    setAnimando(true);
  }
  // A pop-up over the whole screen: the screen beneath is frozen while it shows.
  useCongelarTela('comunicado', !!atual);

  useEffect(() => {
    if (comunicado && !medido) return;
    const fechou = () => {
      setAtual(null);
      setMedido(false);
      setAnimando(false);
    };
    if (comunicado) {
      entrada.set(withTiming(1, { duration: 200, easing: Easing.out(Easing.cubic) }));
      escala.set(withSpring(1, MOLA_GRANDE, (fim) => {
        if (fim) runOnJS(setAnimando)(false);
      }));
      return;
    }
    entrada.set(withTiming(0, { duration: 180, easing: Easing.in(Easing.cubic) }, (fim) => {
      if (fim) runOnJS(fechou)();
    }));
    escala.set(withTiming(0.97, { duration: 180, easing: Easing.in(Easing.cubic) }, (fim) => {
      if (fim) escala.set(DE);
    }));
  }, [comunicado, medido, entrada, escala]);

  useEffect(() => {
    if (!comunicado) return;
    const sub = BackHandler.addEventListener('hardwareBackPress', () => {
      aoFechar();
      return true;
    });
    return () => sub.remove();
  }, [comunicado, aoFechar]);

  const veu = useAnimatedStyle(() => ({ opacity: entrada.value }));
  // A rise with the pop: from 12 pt below, as the scale goes from DE to 1.
  const cartao = useAnimatedStyle(() => ({
    opacity: entrada.value,
    transform: [{ translateY: ((1 - escala.value) / (1 - DE)) * 12 }, { scale: escala.value }],
  }));
  if (!atual) return null;
  return (
    <View pointerEvents={comunicado ? 'auto' : 'none'} style={[StyleSheet.absoluteFill, styles.camada]}>
      <Reanimated.View style={[StyleSheet.absoluteFill, veu]}>
        <Pressable accessibilityLabel="Fechar" onPress={aoFechar} style={[StyleSheet.absoluteFill, { backgroundColor: alfa(colors.scrim, 0.35) }]} />
      </Reanimated.View>
      <View pointerEvents="box-none" style={[styles.centro, {
        paddingTop: insets.top + spacing.lg - SOMBRA, paddingBottom: insets.bottom + spacing.lg - SOMBRA, paddingHorizontal: spacing.lg - SOMBRA,
      }]}>
        <Reanimated.View pointerEvents="box-none" onLayout={() => !medido && requestAnimationFrame(() => setMedido(true))}
          renderToHardwareTextureAndroid={Platform.OS === 'android' && animando}
          style={[{ width: '100%', maxWidth: 560 + 2 * SOMBRA, padding: SOMBRA }, cartao]}>
          <Glass opaco radius={radius.xl} style={{ maxHeight: height - insets.top - insets.bottom - 2 * spacing.lg }}>
            <ScrollView contentContainerStyle={{ gap: spacing.lg, padding: width >= 640 ? spacing['3xl'] : spacing.xl }}>
              <View style={{ flexDirection: 'row', alignItems: 'flex-start', gap: spacing.md }}>
                <Texto v="titulo" style={{ flex: 1 }}>{atual.titulo}</Texto>
                <BotaoDeIcone icone="fechar" rotulo="Fechar" onPress={aoFechar} tamanho={24} lado={36} rente />
              </View>
              {atual.imagens.map((caminho) => <Imagem key={caminho} uri={urlDaImagem(caminho)} />)}
              {atual.texto.trim() ? <View><Resposta texto={atual.texto} streaming={false} /></View> : null}
              <View style={{ gap: spacing.sm }}>
                <Botao rotulo={atual.tipo === 'aviso' ? 'Fechar' : 'Entendi'} onPress={aoFechar} />
                {atual.tipo === 'aviso' ? <Botao v="secundario" rotulo="Ocultar este aviso" onPress={aoOcultar} /> : null}
              </View>
            </ScrollView>
          </Glass>
        </Reanimated.View>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  pilula: { flexDirection: 'row', alignItems: 'center', height: 40, maxWidth: '100%' },
  ponto: { width: 8, height: 8, borderRadius: 4 },
  camada: { zIndex: 50 },
  centro: { position: 'absolute', top: 0, right: 0, bottom: 0, left: 0, alignItems: 'center', justifyContent: 'center' },
});
