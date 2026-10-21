/**
 * A widget full screen: drawn again at the screen's size (not a stretched picture), with pinch to
 * zoom around the fingers, a drag to move around and a double tap to zoom in or back out. Every
 * gesture has a button too (the zoom bar), and the system back, Escape (web) or the close button
 * leave. Opaque panes, so nothing blurs behind it; only the transform animates, on the UI thread.
 */
import { StatusBar } from 'expo-status-bar';
import React, { useCallback, useEffect, useMemo, useState, type ReactNode } from 'react';
import { Modal, View, type LayoutChangeEvent } from 'react-native';
import { Gesture, GestureDetector, GestureHandlerRootView } from 'react-native-gesture-handler';
import Reanimated, {
  Easing, runOnJS, useAnimatedReaction, useAnimatedStyle, useSharedValue, withDecay, withTiming,
} from 'react-native-reanimated';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { BotaoDeIcone, Texto } from '../ui';
import { alfa, useTheme } from '../../theme';

const MAXIMO = 4;
/** One press of a zoom button, and the double tap's zoom. */
const PASSO = 1.6;
const DUPLO = 2.5;
const ASSENTAR = { duration: 220, easing: Easing.out(Easing.cubic) };

type Medidas = { largura: number; altura: number };

/**
 * Pinch, drag and double tap over a drawing centered in an area and scaled about its center: it may
 * move until its edge meets the area's. Everything runs on the UI thread; `zoomPara` also serves the
 * buttons, from the JS thread.
 */
function useZoom() {
  const escala = useSharedValue(1);
  /** Where the zoom is heading: quick button presses step from it, not from the scale mid-animation. */
  const alvo = useSharedValue(1);
  const x = useSharedValue(0);
  const y = useSharedValue(0);
  const area = useSharedValue<Medidas>({ largura: 0, altura: 0 });
  const conteudo = useSharedValue<Medidas>({ largura: 0, altura: 0 });
  const inicio = useSharedValue({ escala: 1, x: 0, y: 0, fx: 0, fy: 0 });
  const [percentual, setPercentual] = useState(100);

  const limite = useCallback((s: number, eixo: keyof Medidas) => {
    'worklet';
    return Math.max(0, (s * conteudo.get()[eixo] - area.get()[eixo]) / 2);
  }, [conteudo, area]);
  /** Zoom to `nova` keeping the point (cx, cy), from the area's center, where it is on screen. */
  const zoomPara = useCallback((nova: number, cx: number, cy: number) => {
    'worklet';
    const k = nova / escala.get();
    const [mx, my] = [limite(nova, 'largura'), limite(nova, 'altura')];
    alvo.set(nova);
    escala.set(withTiming(nova, ASSENTAR));
    x.set(withTiming(Math.min(mx, Math.max(-mx, cx - k * (cx - x.get()))), ASSENTAR));
    y.set(withTiming(Math.min(my, Math.max(-my, cy - k * (cy - y.get()))), ASSENTAR));
  }, [escala, alvo, x, y, limite]);
  /** Unzoomed, a tall drawing at its top. */
  const doTopo = useCallback(() => {
    escala.set(1);
    alvo.set(1);
    x.set(0);
    y.set(Math.max(0, (conteudo.get().altura - area.get().altura) / 2));
  }, [escala, alvo, x, y, conteudo, area]);

  useAnimatedReaction(() => Math.round(escala.get() * 10) * 10, (agora, antes) => {
    if (agora !== antes) runOnJS(setPercentual)(agora);
  });

  const gesto = useMemo(() => {
    const preso = (v: number, m: number) => {
      'worklet';
      return Math.min(m, Math.max(-m, v));
    };
    const assentar = () => {
      'worklet';
      x.set(withTiming(preso(x.get(), limite(escala.get(), 'largura')), ASSENTAR));
      y.set(withTiming(preso(y.get(), limite(escala.get(), 'altura')), ASSENTAR));
    };
    const pinca = Gesture.Pinch()
      .onStart((e) => {
        inicio.set({ escala: escala.get(), x: x.get(), y: y.get(),
          fx: e.focalX - area.get().largura / 2, fy: e.focalY - area.get().altura / 2 });
      })
      .onUpdate((e) => {
        const antes = inicio.get();
        const nova = Math.min(MAXIMO, Math.max(1, antes.escala * e.scale));
        const k = nova / antes.escala;
        // The point that was under the fingers follows them (two fingers also pan).
        x.set(e.focalX - area.get().largura / 2 - k * (antes.fx - antes.x));
        y.set(e.focalY - area.get().altura / 2 - k * (antes.fy - antes.y));
        escala.set(nova);
      })
      .onEnd(() => {
        alvo.set(escala.get());
        assentar();
      });
    const arrasto = Gesture.Pan().maxPointers(1)
      .onStart(() => {
        inicio.set({ ...inicio.get(), x: x.get(), y: y.get() });
      })
      .onUpdate((e) => {
        x.set(preso(inicio.get().x + e.translationX, limite(escala.get(), 'largura')));
        y.set(preso(inicio.get().y + e.translationY, limite(escala.get(), 'altura')));
      })
      .onEnd((e) => {
        const [mx, my] = [limite(escala.get(), 'largura'), limite(escala.get(), 'altura')];
        x.set(withDecay({ velocity: e.velocityX, clamp: [-mx, mx] }));
        y.set(withDecay({ velocity: e.velocityY, clamp: [-my, my] }));
      });
    const toqueDuplo = Gesture.Tap().numberOfTaps(2).maxDuration(300).onEnd((e) => {
      if (escala.get() > 1.05) zoomPara(1, 0, 0);
      else zoomPara(DUPLO, e.x - area.get().largura / 2, e.y - area.get().altura / 2);
    });
    return Gesture.Simultaneous(pinca, arrasto, toqueDuplo);
  }, [escala, alvo, x, y, area, inicio, limite, zoomPara]);

  const movimento = useAnimatedStyle(() => ({
    transform: [{ translateX: x.get() }, { translateY: y.get() }, { scale: escala.get() }],
  }));
  const medirArea = useCallback((e: LayoutChangeEvent) => {
    area.set({ largura: e.nativeEvent.layout.width, altura: e.nativeEvent.layout.height });
  }, [area]);
  /** The first measure of a drawing (each opening) places it. */
  const medirConteudo = useCallback((e: LayoutChangeEvent) => {
    const primeira = !conteudo.get().altura;
    conteudo.set({ largura: e.nativeEvent.layout.width, altura: e.nativeEvent.layout.height });
    if (primeira) doTopo();
  }, [conteudo, doTopo]);
  const esquecer = useCallback(() => conteudo.set({ largura: 0, altura: 0 }), [conteudo]);
  return { gesto, movimento, percentual, zoomPara, medirArea, medirConteudo, esquecer, alvo };
}

export function Visualizador({ aberto, aoFechar, titulo, acoes, aviso, children }: {
  aberto: boolean; aoFechar: () => void; titulo: string;
  /** Buttons beside the title (save, share), and what the last one did. */
  acoes?: ReactNode; aviso?: string | null;
  /** The widget drawn at the width it is given (the height is the room on screen, for a drawing that can use it). */
  children: (largura: number, altura: number) => ReactNode;
}) {
  const { colors, escuro, spacing } = useTheme();
  const insets = useSafeAreaInsets();
  const [livre, setLivre] = useState({ largura: 0, altura: 0 });
  const { gesto, movimento, percentual, zoomPara, medirArea, medirConteudo, esquecer, alvo } = useZoom();
  // Closed, the drawing leaves: the next opening measures and places it again.
  useEffect(() => {
    if (!aberto) esquecer();
  }, [aberto, esquecer]);
  const largura = livre.largura - 2 * spacing.lg;
  const barra = { flexDirection: 'row' as const, alignItems: 'center' as const, gap: spacing.xs,
    paddingHorizontal: spacing.sm, backgroundColor: colors.canvas };
  const linha = alfa(colors.foreground, 0.1);

  return (
    <Modal visible={aberto} onRequestClose={aoFechar} animationType="fade" statusBarTranslucent navigationBarTranslucent>
      <StatusBar style={escuro ? 'light' : 'dark'} />
      <GestureHandlerRootView style={{ flex: 1, backgroundColor: colors.canvas }}>
        <View style={[barra, { paddingTop: insets.top + spacing.xs, paddingBottom: spacing.xs, borderBottomWidth: 1, borderColor: linha }]}>
          <BotaoDeIcone icone="fechar" rotulo="Fechar" lado={40} tamanho={20} onPress={aoFechar} />
          <Texto v="subtitulo" numberOfLines={1} style={{ flex: 1 }}>{titulo}</Texto>
          {acoes}
        </View>
        <GestureDetector gesture={gesto}>
          <View collapsable={false} style={{ flex: 1, overflow: 'hidden', alignItems: 'center', justifyContent: 'center' }} onLayout={(e) => {
            medirArea(e);
            setLivre({ largura: Math.floor(e.nativeEvent.layout.width), altura: Math.floor(e.nativeEvent.layout.height) });
          }}>
            <Reanimated.View onLayout={medirConteudo} style={[{ width: largura > 0 ? largura : undefined }, movimento]}>
              {largura > 0 ? children(largura, livre.altura - 2 * spacing.lg) : null}
            </Reanimated.View>
          </View>
        </GestureDetector>
        {aviso ? (
          <Texto v="legenda" centro accessibilityLiveRegion="polite"
            style={{ paddingHorizontal: spacing.lg, paddingVertical: spacing.xs, backgroundColor: colors.canvas }}>{aviso}</Texto>
        ) : null}
        <View style={[barra, { justifyContent: 'center', paddingTop: spacing.xs, paddingBottom: insets.bottom + spacing.xs, borderTopWidth: 1, borderColor: linha }]}>
          <BotaoDeIcone icone="zoomMenos" rotulo="Diminuir o zoom" lado={44} tamanho={22} desabilitado={percentual <= 100}
            onPress={() => zoomPara(Math.max(1, alvo.get() / PASSO), 0, 0)} />
          <Texto v="detalhe" accessibilityRole="button" accessibilityLabel={`Zoom de ${percentual}%: voltar a 100%`}
            onPress={() => zoomPara(1, 0, 0)}
            style={{ minWidth: 56, textAlign: 'center' }}>{percentual}%</Texto>
          <BotaoDeIcone icone="zoomMais" rotulo="Aumentar o zoom" lado={44} tamanho={22} desabilitado={percentual >= MAXIMO * 100}
            onPress={() => zoomPara(Math.min(MAXIMO, alvo.get() * PASSO), 0, 0)} />
        </View>
      </GestureHandlerRootView>
    </Modal>
  );
}
