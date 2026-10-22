/**
 * Floating chrome (the only navigation surface): a blurred glass menu button that
 * opens a sliding opaque-glass drawer (new chat, also from the USPapo brand at its top, the
 * conversations, settings and profile), and the announcements (aviso pill and giant glass). On
 * Android and iOS the drawer also follows a drag; the buttons do everything the drag does.
 */
import { useRouter } from 'expo-router';
import React, { useCallback, useEffect, useMemo, useState, type ReactElement, type ReactNode } from 'react';
import { Keyboard, Platform, Pressable, StyleSheet, View, useWindowDimensions } from 'react-native';
import { Gesture, GestureDetector, type PanGesture } from 'react-native-gesture-handler';
import Reanimated, {
  Easing, cancelAnimation, runOnJS, useAnimatedStyle, useSharedValue, withTiming,
} from 'react-native-reanimated';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import BarraLateral, { type PerfilDaBarra } from './BarraLateral';
import { PilulaAviso, VidroGigante, useComunicados } from './Comunicados';
import Conversas from './Conversas';
import Glass, { useCongelarTela } from './Glass';
import { Icone } from './icons';
import { haptics } from '../lib/device';
import { esquecerAparelho } from '../lib/notificacoes';
import { supabase } from '../lib/supabase';
import { alfa, useTheme } from '../theme';

/** Height below the top inset the chrome occupies (12pt padding + 44pt targets). */
export const ALTURA_CHROME = 56;

type Conta = PerfilDaBarra;

function useConta(): Conta {
  const [conta, setConta] = useState<Conta>({ nome: '', email: '', foto: null, admin: false });
  useEffect(() => {
    let ativo = true;
    void (async () => {
      const { data } = await supabase.auth.getUser();
      const u = data.user;
      if (!u) return;
      const meta = (u.user_metadata ?? {}) as Record<string, string | undefined>;
      const { data: perfil } = await supabase.from('Perfis').select('nome, avatar_url, uspapo_role').eq('id', u.id).maybeSingle();
      if (!ativo) return;
      setConta({
        nome: perfil?.nome || meta.full_name || meta.name || (u.email ?? '').split('@')[0],
        email: u.email ?? '',
        foto: perfil?.avatar_url || meta.avatar_url || meta.picture || null,
        admin: perfil?.uspapo_role === 'admin',
      });
    })();
    return () => {
      ativo = false;
    };
  }, []);
  return conta;
}

/**
 * The drawer follows the tap without a slow start, but spreads its travel over the frames: the old
 * quintic ease-out moved ~60% of the way in its first 2-3 frames, which read as a stutter. This one
 * is at most 62 px a frame at 120 Hz and 90% open in ~150 ms.
 */
const CURVA = Easing.bezier(0.3, 0.7, 0.4, 1);
const ABRIR = { duration: 280, easing: CURVA };
const FECHAR = { duration: 220, easing: CURVA };

const larguraDaGaveta = (janela: number) => (janela >= 768 ? 320 : Math.min(304, janela - 56));

/**
 * After a drag, the drawer goes on at the finger's speed (the curve starts at 0.7 / 0.3, about 2.3
 * times its mean speed), and never takes longer than a tap's slide.
 */
function duracaoDaSoltura(restante: number, velocidade: number, maximo: number): number {
  'worklet';
  return Math.min(maximo, Math.max(120, (2330 * restante) / Math.max(1, Math.abs(velocidade))));
}

type EstadoDaGaveta = {
  aberta: boolean;
  /** Open and done moving: the list refreshes only then, so no render lands mid-slide. */
  assentada: boolean;
  /** Closed and done moving: until then the screen beneath is frozen (see Glass). */
  fechada: boolean;
};

/**
 * The drawer's motion runs on Reanimated, on the UI thread, and starts on the tap itself, before
 * React renders anything. React Native's own timing animation samples its curve at 60 fps, so on a
 * 120 Hz screen every other frame repeated the last position, and it only started after the render
 * (~65 ms after the tap). A drag (`useArrasto`) moves it on the UI thread too.
 */
export function useGaveta() {
  const progresso = useSharedValue(0);
  const [estado, setEstado] = useState<EstadoDaGaveta>({ aberta: false, assentada: false, fechada: true });
  const assentar = useCallback((aberta: boolean) => {
    setEstado((e) => (e.aberta === aberta ? { aberta, assentada: aberta, fechada: !aberta } : e));
  }, []);
  /** Tells React where the drawer is heading (its slide has already started). Opening hides the keyboard. */
  const rumar = useCallback((aberta: boolean) => {
    if (aberta) Keyboard.dismiss();
    setEstado((e) => (e.aberta === aberta ? e : { aberta, assentada: false, fechada: false }));
  }, []);
  /** Slides the rest of the way, from either thread: a tap's whole slide, or the end of a drag (`duracao`). */
  const deslizar = useCallback((aberta: boolean, duracao?: number) => {
    'worklet';
    const curva = aberta ? ABRIR : FECHAR;
    progresso.set(withTiming(aberta ? 1 : 0, { ...curva, duration: duracao ?? curva.duration }, (fim) => {
      if (fim) runOnJS(assentar)(aberta);
    }));
  }, [progresso, assentar]);
  /** A finger has the drawer: it is in motion (screen frozen, panel one texture) until released. */
  const arrastar = useCallback(() => {
    setEstado((e) => (e.assentada || e.fechada ? { ...e, assentada: false, fechada: false } : e));
  }, []);
  const mover = useCallback((aberta: boolean) => {
    deslizar(aberta);
    rumar(aberta);
  }, [deslizar, rumar]);
  return {
    progresso, estado, arrastar, deslizar, rumar,
    abrir: useCallback(() => mover(true), [mover]), fechar: useCallback(() => mover(false), [mover]),
  };
}

export type ControleDaGaveta = ReturnType<typeof useGaveta>;

/**
 * Dragging the drawer (`sentido` 1 opens, -1 closes): it follows the finger, and on release a flick
 * decides, or else how far it is. Only nearly horizontal drags count, so lists still scroll, and
 * horizontal scrollers (tables, code) keep their own drags.
 */
function useArrasto({ progresso, estado, arrastar, deslizar, rumar }: ControleDaGaveta, sentido: 1 | -1): PanGesture {
  const { width } = useWindowDimensions();
  const curso = larguraDaGaveta(width) + 16;
  const inicio = useSharedValue(0);
  return useMemo(() => {
    const gesto = Gesture.Pan()
      .enabled(estado.aberta === (sentido < 0))
      .activeOffsetX(20 * sentido)
      .failOffsetX(-10 * sentido)
      .failOffsetY([-15, 15])
      .onStart((e) => {
        cancelAnimation(progresso);
        inicio.set(e.translationX - progresso.get() * curso);
        runOnJS(arrastar)();
      })
      .onUpdate((e) => {
        progresso.set(Math.min(1, Math.max(0, (e.translationX - inicio.get()) / curso)));
      })
      .onEnd((e) => {
        const p = progresso.get();
        const abrir = Math.abs(e.velocityX) > 400 ? e.velocityX > 0 : p > 0.5;
        deslizar(abrir, duracaoDaSoltura(Math.abs(Number(abrir) - p) * curso, e.velocityX, (abrir ? ABRIR : FECHAR).duration));
        runOnJS(rumar)(abrir);
      });
    // iOS: the screen's left edge stays the system's swipe back.
    return Platform.OS === 'ios' && sentido > 0 ? gesto.hitSlop({ left: -24 }) : gesto;
  }, [estado.aberta, sentido, curso, progresso, inicio, arrastar, deslizar, rumar]);
}

/** The web has no drag: its buttons do it all. */
function Arrastavel({ gesto, children }: { gesto: PanGesture; children: ReactElement }) {
  return Platform.OS === 'web' ? children : <GestureDetector gesture={gesto}>{children}</GestureDetector>;
}

/** Wraps the screens (chrome included): a drag to the right anywhere opens the drawer. */
export function ArrastarParaAbrir({ gaveta, children }: { gaveta: ControleDaGaveta; children: ReactNode }) {
  return <Arrastavel gesto={useArrasto(gaveta, 1)}><View style={styles.flex}>{children}</View></Arrastavel>;
}

function Gaveta({ gaveta, conta }: { gaveta: ControleDaGaveta; conta: Conta }) {
  const { progresso, estado, fechar } = gaveta;
  const { colors } = useTheme();
  const router = useRouter();
  const [pesquisaAberta, setPesquisaAberta] = useState(false);
  const { width } = useWindowDimensions();
  const largura = larguraDaGaveta(width);
  const fecharArrastando = useArrasto(gaveta, -1);
  useCongelarTela('gaveta', !estado.fechada);
  // Stays mounted (hidden by pointerEvents + position): unmounting mid-animation broke later opens.
  const veu = useAnimatedStyle(() => ({ opacity: progresso.value }));
  const painel = useAnimatedStyle(() => ({ transform: [{ translateX: (-largura - 16) * (1 - progresso.value) }] }), [largura]);

  const ir = (destino: string) => {
    Keyboard.dismiss();
    setPesquisaAberta(false);
    fechar();
    router.push(destino as never);
  };
  const minimizar = () => { Keyboard.dismiss(); fechar(); };
  async function sair() {
    minimizar();
    await esquecerAparelho().catch(() => undefined);
    await supabase.auth.signOut().catch(() => undefined);
    router.replace('/login');
  }

  // A drag to the left on the panel or the scrim closes it.
  return (
    <Arrastavel gesto={fecharArrastando}>
      <View pointerEvents={estado.aberta ? 'auto' : 'none'} style={[StyleSheet.absoluteFill, { zIndex: 40 }]}>
        <Reanimated.View style={[StyleSheet.absoluteFill, veu]}>
          <Pressable accessibilityLabel="Fechar menu lateral" onPress={minimizar} style={[StyleSheet.absoluteFill, { backgroundColor: alfa(colors.scrim, 0.25) }]} />
        </Reanimated.View>
        {/* While it slides, the drawer is one GPU texture that only moves (Android redraws every view each frame otherwise). */}
        <Reanimated.View renderToHardwareTextureAndroid={!estado.assentada && !estado.fechada}
          style={[styles.gaveta, { width: largura }, painel]}>
          <BarraLateral conta={conta} aberta={estado.aberta} pesquisaAberta={pesquisaAberta}
            aoAlternarPesquisa={() => { if (pesquisaAberta) Keyboard.dismiss(); setPesquisaAberta((v) => !v); }}
            aoMinimizar={minimizar} aoNavegar={ir} aoSair={() => void sair()}>
            <Conversas aberta={estado.aberta} assentada={estado.assentada} aoAbrir={ir}
              pesquisaAberta={pesquisaAberta} aoFecharPesquisa={() => setPesquisaAberta(false)} />
          </BarraLateral>
        </Reanimated.View>
      </View>
    </Arrastavel>
  );
}

/** `gaveta` comes from the screen group, whose drag opens it (`ArrastarParaAbrir`). */
export default function Chrome({ gaveta }: { gaveta: ControleDaGaveta }) {
  const { colors, radius, spacing } = useTheme();
  const insets = useSafeAreaInsets();
  const conta = useConta();
  const comunicados = useComunicados();

  return (
    <>
      {/* Content scrolling under the clock and icons stays legible under a fade of the canvas, on
          Android and iOS alike: a band of glass ended in a hard edge, and over the empty canvas it
          showed as a stripe (and each Android blur redraws the whole screen every frame). */}
      {insets.top ? (Platform.OS !== 'web' ? (
        <View pointerEvents="none" style={[styles.status, { height: insets.top + spacing.md,
          experimental_backgroundImage: `linear-gradient(to bottom, ${alfa(colors.canvas, 0.94)} 60%, ${alfa(colors.canvas, 0)})` }]} />
      ) : <Glass desfoque semBorda semSombra pointerEvents="none" style={[styles.status, { height: insets.top }]} />) : null}
      <View pointerEvents="box-none" style={[styles.barra, { paddingTop: insets.top + spacing.md, paddingHorizontal: spacing.lg }]}>
        <Glass desfoque radius={radius.md} onPress={() => { gaveta.abrir(); void haptics.selection(); }}
          accessibilityLabel="Abrir barra lateral" aperto={0.9} style={styles.alvo}>
          <Icone nome="painel" cor={colors.mutedForeground} tamanho={24} traco={2} />
        </Glass>
        <View pointerEvents="box-none" style={[styles.meio, { paddingHorizontal: spacing.sm }]}>
          {comunicados.aviso ? <PilulaAviso aviso={comunicados.aviso} aoAbrir={() => comunicados.abrir(comunicados.aviso)} /> : null}
        </View>
        {/* Equal side slots keep the announcement centered in the window, including on home. */}
        <View pointerEvents="none" style={styles.alvo} />
      </View>
      <Gaveta gaveta={gaveta} conta={conta} />
      <VidroGigante comunicado={comunicados.aberto} aoFechar={comunicados.fechar} aoOcultar={comunicados.ocultarAviso} />
    </>
  );
}

const styles = StyleSheet.create({
  flex: { flex: 1 },
  status: { position: 'absolute', top: 0, left: 0, right: 0, zIndex: 30 },
  barra: { position: 'absolute', top: 0, left: 0, right: 0, zIndex: 30, flexDirection: 'row', alignItems: 'flex-start', justifyContent: 'space-between' },
  alvo: { width: 44, height: 44, alignItems: 'center', justifyContent: 'center' },
  meio: { flex: 1, alignItems: 'center', marginTop: 2 },
  gaveta: { position: 'absolute', top: 0, bottom: 0, left: 0 },
});
