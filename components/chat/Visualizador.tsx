/**
 * A widget full screen: drawn again for the room (an SVG redrawn, never a stretched picture) on a
 * sheet with the USPapo watermark, the way its image is saved. 100% fits the sheet to the screen,
 * never below its own size (on a phone a tall timetable pans instead); a pinch out shows all of it.
 *
 * Gestures, all on the UI thread (lib/zoom has the math): a pinch zooms about the fingers (two
 * fingers also pan), one finger drags with momentum, a double tap zooms in or back to 100%. Past an
 * edge or a zoom limit the sheet gives like a rubber band and settles back. The web adds the wheel
 * (a trackpad pinch or Ctrl + wheel zooms about the cursor, the wheel alone pans) and the keys + - 0.
 * Every gesture has a button too (the zoom bar), and the system back, Escape (web) or the close
 * button leave. Opaque panes, so nothing blurs behind it; only the transform animates.
 *
 * The drag moves by the change since its own last event and stands still while a pinch runs, so a
 * finger landing or lifting mid-gesture never jumps the sheet (the old drag resumed from where its
 * first finger had started, and its fling took the speed of that jump: the sheet flew to a corner).
 * A fling only follows a drag that ended cleanly, and each gesture stops the animation it takes over.
 */
import { StatusBar } from 'expo-status-bar';
import React, { useCallback, useEffect, useMemo, useState, type ReactNode } from 'react';
import { Modal, Platform, View, type LayoutChangeEvent } from 'react-native';
import { Gesture, GestureDetector, GestureHandlerRootView } from 'react-native-gesture-handler';
import Reanimated, {
  Easing, cancelAnimation, runOnJS, useAnimatedReaction, useAnimatedStyle, useSharedValue, withDecay, withTiming,
} from 'react-native-reanimated';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { BotaoDeIcone, MarcaDagua, Texto } from '../ui';
import { elastico, escalaElastica, escalas, limite, manterFoco, preso, type Eixo, type Medidas } from '../../lib/zoom';
import { alfa, useTheme } from '../../theme';

const MAXIMO = 4;
/** One press of a zoom button (or a key), and the double tap's zoom. */
const PASSO = 1.6;
const DUPLO = 2.5;
/** Fitting a small drawing to a big screen stops here. */
const ENCAIXE_MAXIMO = 2.5;
/** Room around the fitted sheet. */
const MARGEM = 12;
const ASSENTAR = { duration: 240, easing: Easing.out(Easing.cubic) };
const ENTRADA = { duration: 260, easing: Easing.out(Easing.cubic) };
/** The height the watermark row takes under the widget. */
const ALTURA_DA_MARCA = 24;

type EstadoDoZoom = { percentual: number; noMinimo: boolean; noMaximo: boolean };

function useZoom() {
  const escala = useSharedValue(1);
  /** Where the zoom is heading: quick button presses step from it, not from the scale mid-animation. */
  const alvo = useSharedValue(1);
  const x = useSharedValue(0);
  const y = useSharedValue(0);
  /** 100% (`base`), and how far a pinch may go out and in. */
  const limites = useSharedValue({ base: 1, minimo: 1, maximo: MAXIMO });
  const area = useSharedValue<Medidas>({ largura: 0, altura: 0 });
  const conteudo = useSharedValue<Medidas>({ largura: 0, altura: 0 });
  /** The sheet coming in on each opening (0 -> 1). */
  const entrada = useSharedValue(0);
  /** The pinch: running or not, where it started (focal point from the area's center) and its last focal point. */
  const pinca = useSharedValue({ ativa: false, s: 1, x: 0, y: 0, fx: 0, fy: 0, ux: 0, uy: 0 });
  /**
   * The drag: its last translation and its own position before any rubber band. `retomar`: the sheet
   * moved under it (a pinch, a zoom), so its next move starts from where the sheet is.
   */
  const arrasto = useSharedValue({ tx: 0, ty: 0, x: 0, y: 0, retomar: true });
  const [estado, setEstado] = useState<EstadoDoZoom>({ percentual: 100, noMinimo: true, noMaximo: false });

  const lim = useCallback((s: number, eixo: Eixo) => {
    'worklet';
    return limite(s, conteudo.get(), area.get(), eixo);
  }, [conteudo, area]);

  const parar = useCallback(() => {
    'worklet';
    cancelAnimation(escala);
    cancelAnimation(x);
    cancelAnimation(y);
    arrasto.set({ ...arrasto.get(), retomar: true });
  }, [escala, x, y, arrasto]);

  /**
   * Zoom to `pedida` (kept within the limits) keeping the point (cx, cy), from the area's center,
   * where it is on screen; the sheet ends within its edges. Also how every gesture settles.
   */
  const zoomPara = useCallback((pedida: number, cx: number, cy: number, animar = true) => {
    'worklet';
    const { minimo, maximo } = limites.get();
    const nova = preso(pedida, minimo, maximo);
    const k = nova / escala.get();
    const [mx, my] = [lim(nova, 'largura'), lim(nova, 'altura')];
    const nx = preso(manterFoco(cx, x.get(), k), -mx, mx);
    const ny = preso(manterFoco(cy, y.get(), k), -my, my);
    parar();
    alvo.set(nova);
    if (animar) {
      escala.set(withTiming(nova, ASSENTAR));
      x.set(withTiming(nx, ASSENTAR));
      y.set(withTiming(ny, ASSENTAR));
    } else {
      escala.set(nova);
      x.set(nx);
      y.set(ny);
    }
  }, [limites, escala, alvo, x, y, lim, parar]);

  /** Moves the sheet by (dx, dy) within its edges (the wheel). */
  const moverPor = useCallback((dx: number, dy: number) => {
    'worklet';
    const s = escala.get();
    parar();
    x.set(preso(x.get() + dx, -lim(s, 'largura'), lim(s, 'largura')));
    y.set(preso(y.get() + dy, -lim(s, 'altura'), lim(s, 'altura')));
  }, [escala, x, y, lim, parar]);

  /** Fitted (a tall sheet at its top), once both sizes are known; on an opening it also comes in. */
  const encaixar = useCallback((entrar: boolean) => {
    const [a, c] = [area.get(), conteudo.get()];
    if (!a.largura || !c.largura) return;
    const novos = escalas(c, a, MARGEM, ENCAIXE_MAXIMO, MAXIMO);
    parar();
    limites.set(novos);
    escala.set(novos.base);
    alvo.set(novos.base);
    x.set(0);
    y.set(limite(novos.base, c, a, 'altura'));
    if (entrar) {
      entrada.set(0);
      entrada.set(withTiming(1, ENTRADA));
    }
  }, [area, conteudo, limites, escala, alvo, x, y, entrada, parar]);

  useAnimatedReaction(() => {
    const { base, minimo, maximo } = limites.get();
    const s = escala.get();
    return { percentual: Math.round((s / base) * 10) * 10, noMinimo: s <= minimo * 1.01, noMaximo: s >= maximo * 0.99 };
  }, (agora, antes) => {
    if (!antes || agora.percentual !== antes.percentual || agora.noMinimo !== antes.noMinimo || agora.noMaximo !== antes.noMaximo) {
      runOnJS(setEstado)(agora);
    }
  });

  const gesto = useMemo(() => {
    const doCentro = (fx: number, fy: number) => {
      'worklet';
      const a = area.get();
      return [fx - a.largura / 2, fy - a.altura / 2];
    };
    const pinchar = Gesture.Pinch()
      .onStart((e) => {
        parar();
        const [fx, fy] = doCentro(e.focalX, e.focalY);
        pinca.set({ ativa: true, s: escala.get(), x: x.get(), y: y.get(), fx, fy, ux: fx, uy: fy });
      })
      .onUpdate((e) => {
        const p = pinca.get();
        if (!p.ativa) return;
        const { minimo, maximo } = limites.get();
        const s = escalaElastica(p.s * e.scale, minimo, maximo);
        const k = s / p.s;
        const [fx, fy] = doCentro(e.focalX, e.focalY);
        const a = area.get();
        // The point that was under the fingers follows them.
        escala.set(s);
        x.set(elastico(fx - k * (p.fx - p.x), lim(s, 'largura'), a.largura));
        y.set(elastico(fy - k * (p.fy - p.y), lim(s, 'altura'), a.altura));
        pinca.set({ ...p, ux: fx, uy: fy });
      })
      .onFinalize(() => {
        const p = pinca.get();
        if (!p.ativa) return;
        pinca.set({ ...p, ativa: false });
        zoomPara(escala.get(), p.ux, p.uy);
      });
    const arrastar = Gesture.Pan().maxPointers(1)
      .onStart((e) => {
        cancelAnimation(x);
        cancelAnimation(y);
        arrasto.set({ tx: e.translationX, ty: e.translationY, x: x.get(), y: y.get(), retomar: false });
      })
      .onUpdate((e) => {
        const d = arrasto.get();
        if (pinca.get().ativa) {
          arrasto.set({ ...d, tx: e.translationX, ty: e.translationY, retomar: true });
          return;
        }
        if (d.retomar) {
          cancelAnimation(x);
          cancelAnimation(y);
        }
        const nx = (d.retomar ? x.get() : d.x) + e.translationX - d.tx;
        const ny = (d.retomar ? y.get() : d.y) + e.translationY - d.ty;
        arrasto.set({ tx: e.translationX, ty: e.translationY, x: nx, y: ny, retomar: false });
        const s = escala.get();
        const a = area.get();
        x.set(elastico(nx, lim(s, 'largura'), a.largura));
        y.set(elastico(ny, lim(s, 'altura'), a.altura));
      })
      .onEnd((e, limpo) => {
        if (pinca.get().ativa) return; // the pinch settles it
        const s = escala.get();
        if (!limpo || arrasto.get().retomar) {
          zoomPara(s, 0, 0);
          return;
        }
        const [mx, my] = [lim(s, 'largura'), lim(s, 'altura')];
        x.set(withDecay({ velocity: e.velocityX, clamp: [-mx, mx], rubberBandEffect: true, rubberBandFactor: 0.7 }));
        y.set(withDecay({ velocity: e.velocityY, clamp: [-my, my], rubberBandEffect: true, rubberBandFactor: 0.7 }));
      });
    const toqueDuplo = Gesture.Tap().numberOfTaps(2).maxDelay(260).onEnd((e, limpo) => {
      if (!limpo) return;
      const { base } = limites.get();
      const [cx, cy] = doCentro(e.x, e.y);
      zoomPara(Math.abs(alvo.get() - base) > base * 0.05 ? base : base * DUPLO, cx, cy);
    });
    return Gesture.Simultaneous(pinchar, arrastar, toqueDuplo);
  }, [area, escala, alvo, x, y, limites, pinca, arrasto, lim, parar, zoomPara]);

  const movimento = useAnimatedStyle(() => ({
    opacity: entrada.get(),
    transform: [{ translateX: x.get() }, { translateY: y.get() }, { scale: escala.get() * (0.96 + 0.04 * entrada.get()) }],
  }));
  /** A new area (a rotation, a resized window) fits the sheet again. */
  const medirArea = useCallback((e: LayoutChangeEvent) => {
    area.set({ largura: e.nativeEvent.layout.width, altura: e.nativeEvent.layout.height });
    encaixar(false);
  }, [area, encaixar]);
  /** The first measure of a sheet (each opening) places it and brings it in; a later change refits it. */
  const medirConteudo = useCallback((e: LayoutChangeEvent) => {
    const primeira = !conteudo.get().altura;
    conteudo.set({ largura: e.nativeEvent.layout.width, altura: e.nativeEvent.layout.height });
    encaixar(primeira);
  }, [conteudo, encaixar]);
  const esquecer = useCallback(() => conteudo.set({ largura: 0, altura: 0 }), [conteudo]);
  /** A zoom button or key: a step from where the zoom is heading, about the center. */
  const passo = useCallback((fator: number) => zoomPara(alvo.get() * fator, 0, 0), [zoomPara, alvo]);
  const voltar = useCallback(() => zoomPara(limites.get().base, 0, 0), [zoomPara, limites]);
  return { gesto, movimento, estado, zoomPara, moverPor, passo, voltar, medirArea, medirConteudo, esquecer, escala };
}

/** Web: the wheel (pinch on a trackpad, Ctrl + wheel: zoom about the cursor; alone: pan) and the keys + - 0. */
function useRodaEteclas(no: HTMLElement | null, zoom: ReturnType<typeof useZoom>) {
  const { zoomPara, moverPor, passo, voltar, escala } = zoom;
  useEffect(() => {
    if (Platform.OS !== 'web' || !no) return;
    const roda = (e: WheelEvent) => {
      e.preventDefault();
      const r = no.getBoundingClientRect();
      const unidade = e.deltaMode === 1 ? 16 : e.deltaMode === 2 ? r.height : 1;
      if (e.ctrlKey || e.metaKey) {
        // A trackpad pinch sends small steps; a mouse wheel's notch (~100) stops at ~1.65x.
        const fator = Math.exp(-preso(e.deltaY * unidade, -50, 50) * 0.01);
        zoomPara(escala.get() * fator, e.clientX - r.left - r.width / 2, e.clientY - r.top - r.height / 2, false);
      } else {
        moverPor(-e.deltaX * unidade, -e.deltaY * unidade);
      }
    };
    const tecla = (e: KeyboardEvent) => {
      if (e.ctrlKey || e.metaKey || e.altKey) return;
      if (e.key === '+' || e.key === '=') passo(PASSO);
      else if (e.key === '-' || e.key === '_') passo(1 / PASSO);
      else if (e.key === '0') voltar();
      else return;
      e.preventDefault();
    };
    no.addEventListener('wheel', roda, { passive: false });
    document.addEventListener('keydown', tecla);
    return () => {
      no.removeEventListener('wheel', roda);
      document.removeEventListener('keydown', tecla);
    };
  }, [no, zoomPara, moverPor, passo, voltar, escala]);
}

export function Visualizador({ aberto, aoFechar, titulo, detalhe, acoes, aviso, children }: {
  aberto: boolean; aoFechar: () => void; titulo: string;
  /** Under the title, in Roboto Mono (a line, a weekly total). */
  detalhe?: string;
  /** Buttons beside the title (save, share), and what the last one did. */
  acoes?: ReactNode; aviso?: string | null;
  /**
   * The widget for the room on screen: it takes the width it reads best at, up to `largura` (a
   * timetable keeps its chat width; an SVG map can take it all), and the viewer fits the sheet.
   */
  children: (largura: number, altura: number) => ReactNode;
}) {
  const { colors, escuro, glass, radius, spacing } = useTheme();
  const insets = useSafeAreaInsets();
  const [livre, setLivre] = useState({ largura: 0, altura: 0 });
  const [no, setNo] = useState<HTMLElement | null>(null);
  const zoom = useZoom();
  const { gesto, movimento, estado, passo, voltar, medirArea, medirConteudo, esquecer } = zoom;
  useRodaEteclas(aberto ? no : null, zoom);
  // Closed, the sheet leaves: the next opening measures, places and brings it in again.
  useEffect(() => {
    if (!aberto) esquecer();
  }, [aberto, esquecer]);
  const recuo = MARGEM + spacing.lg; // the margin, then the sheet's own padding
  const largura = livre.largura - 2 * recuo;
  const linha = alfa(colors.foreground, 0.12);
  const pilula = {
    flexDirection: 'row' as const, alignItems: 'center' as const, gap: spacing.xs, padding: spacing.xs,
    borderRadius: radius.full, borderWidth: 1, borderColor: linha, backgroundColor: colors.canvas, ...glass.shadow,
  };

  return (
    <Modal visible={aberto} onRequestClose={aoFechar} animationType="fade" statusBarTranslucent navigationBarTranslucent>
      <StatusBar style={escuro ? 'light' : 'dark'} />
      <GestureHandlerRootView style={{ flex: 1, backgroundColor: colors.canvas }}>
        <View style={{ flexDirection: 'row', alignItems: 'center', gap: spacing.sm, paddingHorizontal: spacing.md,
          paddingTop: insets.top + spacing.sm, paddingBottom: spacing.xs }}>
          <View style={pilula}>
            <BotaoDeIcone icone="fechar" rotulo="Fechar" lado={36} tamanho={20} onPress={aoFechar} />
          </View>
          <View style={{ flex: 1 }}>
            <Texto v="subtitulo" numberOfLines={1}>{titulo}</Texto>
            {detalhe ? <Texto v="detalhe" numberOfLines={1}>{detalhe}</Texto> : null}
          </View>
          {acoes ? <View style={pilula}>{acoes}</View> : null}
        </View>
        <GestureDetector gesture={gesto}>
          <View ref={Platform.OS === 'web' ? (n) => setNo(n as unknown as HTMLElement | null) : undefined} collapsable={false}
            accessibilityHint="Pince ou toque duas vezes para ampliar; arraste para mover"
            style={{ flex: 1, overflow: 'hidden', alignItems: 'center', justifyContent: 'center' }} onLayout={(e) => {
              medirArea(e);
              setLivre({ largura: Math.floor(e.nativeEvent.layout.width), altura: Math.floor(e.nativeEvent.layout.height) });
            }}>
            {largura > 0 ? (
              <Reanimated.View onLayout={medirConteudo} style={[{ padding: spacing.lg, gap: spacing.sm, borderRadius: radius.lg,
                borderWidth: 1, borderColor: linha, backgroundColor: colors.canvas }, movimento]}>
                {children(largura, livre.altura - 2 * recuo - ALTURA_DA_MARCA)}
                <MarcaDagua />
              </Reanimated.View>
            ) : null}
          </View>
        </GestureDetector>
        <View style={{ alignItems: 'center', paddingTop: spacing.xs, paddingBottom: insets.bottom + spacing.md }}>
          <View style={pilula}>
            <BotaoDeIcone icone="zoomMenos" rotulo="Diminuir o zoom" lado={40} tamanho={22} desabilitado={estado.noMinimo}
              onPress={() => passo(1 / PASSO)} />
            <Texto v="detalhe" accessibilityRole="button" accessibilityLabel={`Zoom de ${estado.percentual}%: voltar a 100%`}
              onPress={voltar} style={{ minWidth: 52, textAlign: 'center' }}>{estado.percentual}%</Texto>
            <BotaoDeIcone icone="zoomMais" rotulo="Aumentar o zoom" lado={40} tamanho={22} desabilitado={estado.noMaximo}
              onPress={() => passo(PASSO)} />
          </View>
        </View>
        {/* Over the sheet, so the area keeps its size (a resize would fit the sheet again). */}
        {aviso ? (
          <View pointerEvents="none" style={{ position: 'absolute', left: spacing.lg, right: spacing.lg,
            bottom: insets.bottom + spacing.md + 56, alignItems: 'center' }}>
            <View style={[pilula, { paddingHorizontal: spacing.md, paddingVertical: spacing.sm }]}>
              <Texto v="legenda" cor={colors.foreground} accessibilityLiveRegion="polite">{aviso}</Texto>
            </View>
          </View>
        ) : null}
      </GestureHandlerRootView>
    </Modal>
  );
}
