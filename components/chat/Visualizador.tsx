/**
 * A widget full screen: drawn again for the room (an SVG redrawn, never a stretched picture) on a
 * sheet whose footer has the data's source and the USPapo mark, the way its image is saved. 100%
 * fits the sheet to the room between the bars, never below its own size (on a phone a tall
 * timetable pans instead); a pinch out shows all of it.
 *
 * The controls are the interface's floating glass (components/Glass): the close button with the
 * title, the actions and the zoom bar blur the sheet as it passes under them. The sheet takes the
 * whole screen; it is fitted to, and kept within, the room between the bars.
 *
 * The zoom is deliberately plain (lib/zoom has the math). One rule, applied on every move and never
 * corrected afterwards: the sheet never leaves the room. Every gesture moves the sheet by the change
 * since its last event, from where the sheet is: a pinch scales about the fingers and follows them
 * (when a finger lands or lifts, the fingers' center jumps, so that event only takes the new center
 * in); one finger drags, with momentum; a double tap zooms in or back to 100%. Held at an edge, the
 * sheet answers as soon as the fingers turn back. The zoom bar, the keys + - 0 and the web's wheel
 * use the same zoom. Gestures run on the UI thread and nothing in React touches the sheet while they
 * run: only the zoom bar re-renders.
 */
import { StatusBar } from 'expo-status-bar';
import React, { memo, useCallback, useEffect, useMemo, useState, type ReactNode } from 'react';
import { Modal, Platform, StyleSheet, View, type LayoutChangeEvent } from 'react-native';
import { Gesture, GestureDetector, GestureHandlerRootView } from 'react-native-gesture-handler';
import Reanimated, {
  Easing, cancelAnimation, runOnJS, runOnUI, useAnimatedReaction, useAnimatedStyle, useSharedValue, withDecay, withTiming,
  type SharedValue,
} from 'react-native-reanimated';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import Glass, { CamadaDeVidro } from '../Glass';
import { BotaoDeIcone, MarcaDagua, Texto } from '../ui';
import { escalas, limite, manterFoco, pincar, preso, proximoNivel, topoDaFolha, type Eixo, type Medidas } from '../../lib/zoom';
import { alfa, useTheme } from '../../theme';

const MAXIMO = 4;
/** The double tap's zoom (the buttons and keys climb lib/zoom's NIVEIS). */
const DUPLO = 2.5;
/** Fitting a small drawing to a big screen stops here. */
const ENCAIXE_MAXIMO = 2.5;
/** Room around the fitted sheet. */
const MARGEM = 12;
const ASSENTAR = { duration: 240, easing: Easing.out(Easing.cubic) };
/** The height the footer row (source and mark) takes under the widget. */
const ALTURA_DO_RODAPE = 24;
/** A glass bar's height (a 40 px button and its padding), and the gap around the bars. */
const BARRA = 50;
const FOLGA = 8;

type Limites = { base: number; minimo: number; maximo: number };
/** The pinch: running or not, and its last event's scale, fingers' center (from the room's) and fingers. */
type Pinca = { ativa: boolean; e: number; fx: number; fy: number; dedos: number };

/**
 * A widget's footer, the same in the chat, full screen and in the saved image: where the data comes
 * from on the left and the USPapo mark on the right, in one row (the mark adds no row of its own).
 */
export function RodapeDoWidget({ fonte }: { fonte?: string }) {
  const { spacing } = useTheme();
  return (
    <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: fonte ? 'space-between' : 'flex-end', gap: spacing.md }}>
      {fonte ? <Texto v="detalhe" numberOfLines={2} style={{ flexShrink: 1 }}>{fonte}</Texto> : null}
      <MarcaDagua />
    </View>
  );
}

function useZoom() {
  const s = useSharedValue(1);
  const x = useSharedValue(0);
  const y = useSharedValue(0);
  /** Where the zoom is heading: quick button presses step from it, not from the scale mid-animation. */
  const alvo = useSharedValue(1);
  /** 100% (`base`), and how far the zoom may go out and in. */
  const limites = useSharedValue<Limites>({ base: 1, minimo: 1, maximo: MAXIMO });
  /** The room between the bars, where it starts (gestures count from its center), and the sheet. */
  const area = useSharedValue<Medidas>({ largura: 0, altura: 0 });
  const topo = useSharedValue(0);
  const conteudo = useSharedValue<Medidas>({ largura: 0, altura: 0 });
  /** The sheet shows once it is fitted (0 until its first fit on each opening). */
  const visivel = useSharedValue(0);
  const pinca = useSharedValue<Pinca>({ ativa: false, e: 1, fx: 0, fy: 0, dedos: 0 });
  /** The drag's last translation: it moves the sheet by the change since then. */
  const arrasto = useSharedValue({ tx: 0, ty: 0 });

  /** The one rule: at scale `escala`, a position on an axis kept so the sheet never leaves the room. */
  const dentro = useCallback((v: number, escala: number, eixo: Eixo) => {
    'worklet';
    const m = limite(escala, conteudo.get(), area.get(), eixo);
    return preso(v, -m, m);
  }, [conteudo, area]);

  const parar = useCallback(() => {
    'worklet';
    cancelAnimation(s);
    cancelAnimation(x);
    cancelAnimation(y);
  }, [s, x, y]);

  /** Scale, position: animated, or at once. */
  const ir = useCallback((nova: number, nx: number, ny: number, animar: boolean) => {
    'worklet';
    parar();
    alvo.set(nova);
    s.set(animar ? withTiming(nova, ASSENTAR) : nova);
    x.set(animar ? withTiming(nx, ASSENTAR) : nx);
    y.set(animar ? withTiming(ny, ASSENTAR) : ny);
  }, [parar, alvo, s, x, y]);

  /** Zoom to `pedida` (within the limits), the point (cx, cy) from the room's center staying put. */
  const zoomPara = useCallback((pedida: number, cx: number, cy: number, animar = true) => {
    'worklet';
    const { minimo, maximo } = limites.get();
    const nova = preso(pedida, minimo, maximo);
    const k = nova / s.get();
    ir(nova, dentro(manterFoco(cx, x.get(), k), nova, 'largura'), dentro(manterFoco(cy, y.get(), k), nova, 'altura'), animar);
  }, [limites, s, x, y, dentro, ir]);

  /** The opening's view: 100%, centered across, a tall sheet at its top. */
  const restaurar = useCallback((animar = true) => {
    'worklet';
    const { base } = limites.get();
    ir(base, 0, topoDaFolha(base, conteudo.get(), area.get()), animar);
  }, [limites, conteudo, area, ir]);

  /**
   * A size from onLayout, on the UI thread (a value written from JS reached it a moment later, and
   * the fit read zeros on Android). A real change of size fits the sheet again; never mid-pinch.
   */
  const medir = useCallback((qual: 'area' | 'conteudo', largura: number, altura: number, inicio: number) => {
    'worklet';
    const antes = qual === 'area' ? area.get() : conteudo.get();
    if (Math.abs(antes.largura - largura) < 1 && Math.abs(antes.altura - altura) < 1) return;
    if (qual === 'area') {
      area.set({ largura, altura });
      topo.set(inicio);
    } else {
      conteudo.set({ largura, altura });
    }
    const [a, c] = [area.get(), conteudo.get()];
    if (!a.largura || !c.largura || pinca.get().ativa) return;
    limites.set(escalas(c, a, MARGEM, ENCAIXE_MAXIMO, MAXIMO));
    restaurar(false);
    visivel.set(1);
  }, [area, topo, conteudo, pinca, limites, restaurar, visivel]);

  const gesto = useMemo(() => {
    const doCentro = (fx: number, fy: number) => {
      'worklet';
      const a = area.get();
      return [fx - a.largura / 2, fy - topo.get() - a.altura / 2];
    };
    const pinchar = Gesture.Pinch()
      .onStart((e) => {
        parar();
        const [fx, fy] = doCentro(e.focalX, e.focalY);
        pinca.set({ ativa: true, e: e.scale || 1, fx, fy, dedos: e.numberOfPointers });
      })
      .onUpdate((e) => {
        const p = pinca.get();
        if (!p.ativa || !e.scale) return;
        const [fx, fy] = doCentro(e.focalX, e.focalY);
        pinca.set({ ativa: true, e: e.scale, fx, fy, dedos: e.numberOfPointers });
        // A finger landed or lifted (the pinch goes on until the last one lifts): the fingers'
        // center jumped with it, and the sheet must not.
        if (e.numberOfPointers !== p.dedos) return;
        const { minimo, maximo } = limites.get();
        const v = pincar({ s: s.get(), x: x.get(), y: y.get() }, e.scale / p.e, { x: p.fx, y: p.fy }, { x: fx, y: fy },
          minimo, maximo, conteudo.get(), area.get());
        s.set(v.s);
        x.set(v.x);
        y.set(v.y);
      })
      .onFinalize(() => {
        const p = pinca.get();
        if (!p.ativa) return;
        pinca.set({ ...p, ativa: false });
        alvo.set(s.get());
      });
    const arrastar = Gesture.Pan().maxPointers(1)
      .onStart((e) => {
        cancelAnimation(x);
        cancelAnimation(y);
        arrasto.set({ tx: e.translationX, ty: e.translationY });
      })
      .onUpdate((e) => {
        const d = arrasto.get();
        arrasto.set({ tx: e.translationX, ty: e.translationY });
        if (pinca.get().ativa) return; // two fingers: the pinch moves the sheet
        const escala = s.get();
        x.set(dentro(x.get() + e.translationX - d.tx, escala, 'largura'));
        y.set(dentro(y.get() + e.translationY - d.ty, escala, 'altura'));
      })
      .onEnd((e, limpo) => {
        if (!limpo || pinca.get().ativa) return;
        const escala = s.get();
        const [mx, my] = [limite(escala, conteudo.get(), area.get(), 'largura'), limite(escala, conteudo.get(), area.get(), 'altura')];
        x.set(withDecay({ velocity: e.velocityX, clamp: [-mx, mx] }));
        y.set(withDecay({ velocity: e.velocityY, clamp: [-my, my] }));
      });
    const toqueDuplo = Gesture.Tap().numberOfTaps(2).maxDelay(260).onEnd((e, limpo) => {
      if (!limpo) return;
      const { base } = limites.get();
      if (alvo.get() > base * 1.05) {
        restaurar();
      } else {
        const [cx, cy] = doCentro(e.x, e.y);
        zoomPara(base * DUPLO, cx, cy);
      }
    });
    return Gesture.Simultaneous(pinchar, arrastar, toqueDuplo);
  }, [area, topo, conteudo, s, x, y, alvo, limites, pinca, arrasto, dentro, parar, zoomPara, restaurar]);

  const movimento = useAnimatedStyle(() => ({
    opacity: visivel.get(),
    transform: [{ translateX: x.get() }, { translateY: y.get() }, { scale: s.get() }],
  }));
  /** The screen less the bars is the room. */
  const medirArea = useCallback((e: LayoutChangeEvent, acima: number, abaixo: number) => {
    const { width, height } = e.nativeEvent.layout;
    runOnUI(medir)('area', width, Math.max(1, height - acima - abaixo), acima);
  }, [medir]);
  const medirConteudo = useCallback((e: LayoutChangeEvent) => {
    runOnUI(medir)('conteudo', e.nativeEvent.layout.width, e.nativeEvent.layout.height, 0);
  }, [medir]);
  /** Closed, the sheet leaves: the next opening measures and fits it again. */
  const esquecer = useCallback(() => {
    runOnUI(() => {
      'worklet';
      conteudo.set({ largura: 0, altura: 0 });
      visivel.set(0);
    })();
  }, [conteudo, visivel]);
  /** A zoom button or key: the next step up or down about the center; 100% is the opening's view. */
  const passo = useCallback((direcao: 1 | -1) => {
    runOnUI((d: 1 | -1) => {
      'worklet';
      const { base, minimo, maximo } = limites.get();
      const nova = proximoNivel(alvo.get(), base, minimo, maximo, d);
      if (Math.abs(nova - base) < base * 0.001) restaurar();
      else zoomPara(nova, 0, 0);
    })(direcao);
  }, [limites, alvo, zoomPara, restaurar]);
  const voltar = useCallback(() => {
    runOnUI(() => {
      'worklet';
      restaurar();
    })();
  }, [restaurar]);
  /** The wheel: zoom by a factor about (cx, cy) from the room's center, or move the sheet. */
  const zoomPorFator = useCallback((fator: number, cx: number, cy: number) => {
    runOnUI((f: number, px: number, py: number) => {
      'worklet';
      zoomPara(s.get() * f, px, py, false);
    })(fator, cx, cy);
  }, [zoomPara, s]);
  const mover = useCallback((dx: number, dy: number) => {
    runOnUI((ax: number, ay: number) => {
      'worklet';
      parar();
      x.set(dentro(x.get() + ax, s.get(), 'largura'));
      y.set(dentro(y.get() + ay, s.get(), 'altura'));
    })(dx, dy);
  }, [parar, dentro, s, x, y]);
  return { gesto, movimento, s, limites, pinca, zoomPorFator, mover, passo, voltar, medirArea, medirConteudo, esquecer };
}

/**
 * Web: the wheel (pinch on a trackpad, Ctrl + wheel: zoom about the cursor; alone: pan) and the keys
 * + - 0. `acima`/`abaixo`: the bars, so the cursor counts from the room's center.
 */
function useRodaEteclas(no: HTMLElement | null, zoom: ReturnType<typeof useZoom>, acima: number, abaixo: number) {
  const { zoomPorFator, mover, passo, voltar } = zoom;
  useEffect(() => {
    if (Platform.OS !== 'web' || !no) return;
    const roda = (e: WheelEvent) => {
      e.preventDefault();
      const r = no.getBoundingClientRect();
      const unidade = e.deltaMode === 1 ? 16 : e.deltaMode === 2 ? r.height : 1;
      if (e.ctrlKey || e.metaKey) {
        // A trackpad pinch sends small steps; a mouse wheel's notch (~100) stops at ~1.65x.
        const fator = Math.exp(-preso(e.deltaY * unidade, -50, 50) * 0.01);
        const meio = acima + (r.height - acima - abaixo) / 2;
        zoomPorFator(fator, e.clientX - r.left - r.width / 2, e.clientY - r.top - meio);
      } else {
        mover(-e.deltaX * unidade, -e.deltaY * unidade);
      }
    };
    const tecla = (e: KeyboardEvent) => {
      if (e.ctrlKey || e.metaKey || e.altKey) return;
      if (e.key === '+' || e.key === '=') passo(1);
      else if (e.key === '-' || e.key === '_') passo(-1);
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
  }, [no, zoomPorFator, mover, passo, voltar, acima, abaixo]);
}

/**
 * The zoom bar: −, the percentage (100% is the fitted sheet; pressed, it goes back there) and +.
 * It follows the zoom once a pinch ends (to the nearest 5%), and only it re-renders.
 */
const BarraDeZoom = memo(function BarraDeZoom({ s, limites, pinca, passo, voltar }: {
  s: SharedValue<number>; limites: SharedValue<Limites>; pinca: SharedValue<Pinca>;
  passo: (d: 1 | -1) => void; voltar: () => void;
}) {
  const { radius, spacing } = useTheme();
  const [estado, setEstado] = useState({ percentual: 100, noMinimo: true, noMaximo: false });
  useAnimatedReaction(() => {
    if (pinca.get().ativa) return null;
    const { base, minimo, maximo } = limites.get();
    const escala = s.get();
    return { percentual: Math.round((escala / base) * 20) * 5, noMinimo: escala <= minimo * 1.01, noMaximo: escala >= maximo * 0.99 };
  }, (agora, antes) => {
    if (agora && (!antes || agora.percentual !== antes.percentual || agora.noMinimo !== antes.noMinimo || agora.noMaximo !== antes.noMaximo)) {
      runOnJS(setEstado)(agora);
    }
  });
  return (
    <Glass desfoque radius={radius.full} style={{ flexDirection: 'row', alignItems: 'center', gap: spacing.xs, padding: 4 }}>
      <BotaoDeIcone icone="zoomMenos" rotulo="Diminuir o zoom" lado={40} tamanho={22} desabilitado={estado.noMinimo}
        onPress={() => passo(-1)} />
      <Texto v="detalhe" accessibilityRole="button" accessibilityLabel={`Zoom de ${estado.percentual}%: voltar a 100%`}
        onPress={voltar} style={{ minWidth: 52, textAlign: 'center' }}>{estado.percentual}%</Texto>
      <BotaoDeIcone icone="zoomMais" rotulo="Aumentar o zoom" lado={40} tamanho={22} desabilitado={estado.noMaximo}
        onPress={() => passo(1)} />
    </Glass>
  );
});

export function Visualizador({ aberto, aoFechar, titulo, detalhe, fonte, acoes, aviso, children }: {
  aberto: boolean; aoFechar: () => void; titulo: string;
  /** Under the title, in Roboto Mono (a line, a weekly total). */
  detalhe?: string;
  /** Where the data comes from, in the sheet's footer beside the mark. */
  fonte?: string;
  /** Buttons beside the title (save, share), and what the last one did. */
  acoes?: ReactNode; aviso?: string | null;
  /**
   * The widget for the room on screen: it takes the width it reads best at, up to `largura` (a
   * timetable keeps its chat width; an SVG map can take it all), and the viewer fits the sheet.
   */
  children: (largura: number, altura: number) => ReactNode;
}) {
  const { colors, escuro, radius, spacing } = useTheme();
  const insets = useSafeAreaInsets();
  const [livre, setLivre] = useState({ largura: 0, altura: 0 });
  const [no, setNo] = useState<HTMLElement | null>(null);
  // The bars float over the sheet: the room to fit it in starts under the top one and ends over the bottom one.
  const acima = insets.top + FOLGA + BARRA + FOLGA;
  const abaixo = insets.bottom + spacing.md + BARRA + FOLGA;
  const zoom = useZoom();
  const { gesto, movimento, s, limites, pinca, passo, voltar, medirArea, medirConteudo, esquecer } = zoom;
  useRodaEteclas(aberto ? no : null, zoom, acima, abaixo);
  useEffect(() => {
    if (!aberto) esquecer();
  }, [aberto, esquecer]);
  const recuo = MARGEM + spacing.lg; // the margin, then the sheet's own padding
  const largura = livre.largura - 2 * recuo;
  const alturaDoWidget = livre.altura - 2 * recuo - ALTURA_DO_RODAPE;
  const folha = useMemo(() => (largura > 0 ? (
    <Reanimated.View onLayout={medirConteudo} style={[{ padding: spacing.lg, gap: spacing.sm, borderRadius: radius.lg,
      borderWidth: 1, borderColor: alfa(colors.foreground, 0.12), backgroundColor: colors.canvas }, movimento]}>
      {children(largura, alturaDoWidget)}
      <RodapeDoWidget fonte={fonte} />
    </Reanimated.View>
  ) : null), [largura, alturaDoWidget, children, fonte, medirConteudo, movimento, colors, radius, spacing]);

  return (
    <Modal visible={aberto} onRequestClose={aoFechar} animationType="fade" statusBarTranslucent navigationBarTranslucent>
      <StatusBar style={escuro ? 'light' : 'dark'} />
      <GestureHandlerRootView style={{ flex: 1, backgroundColor: colors.canvas }}>
        <CamadaDeVidro
          fundo={
            <GestureDetector gesture={gesto}>
              <View ref={Platform.OS === 'web' ? (n) => setNo(n as unknown as HTMLElement | null) : undefined} collapsable={false}
                accessibilityHint="Pince ou toque duas vezes para ampliar; arraste para mover"
                style={{ flex: 1, overflow: 'hidden', alignItems: 'center', justifyContent: 'center', paddingTop: acima, paddingBottom: abaixo }}
                onLayout={(e) => {
                  medirArea(e, acima, abaixo);
                  const { width, height } = e.nativeEvent.layout;
                  setLivre({ largura: Math.floor(width), altura: Math.floor(height - acima - abaixo) });
                }}>
                {folha}
              </View>
            </GestureDetector>
          }
          frente={
            <View pointerEvents="box-none" style={StyleSheet.absoluteFill}>
              <View pointerEvents="box-none" style={{ position: 'absolute', top: insets.top + FOLGA, left: spacing.md, right: spacing.md,
                flexDirection: 'row', alignItems: 'center', gap: spacing.sm }}>
                <Glass desfoque radius={radius.full} style={{ flexShrink: 1, flexDirection: 'row', alignItems: 'center', gap: spacing.xs,
                  padding: 4, paddingRight: spacing.lg, minHeight: BARRA }}>
                  <BotaoDeIcone icone="fechar" rotulo="Fechar" lado={40} tamanho={20} onPress={aoFechar} />
                  <View style={{ flexShrink: 1 }}>
                    <Texto v="subtitulo" numberOfLines={1}>{titulo}</Texto>
                    {detalhe ? <Texto v="detalhe" numberOfLines={1}>{detalhe}</Texto> : null}
                  </View>
                </Glass>
                <View style={{ flex: 1 }} />
                {acoes ? (
                  <Glass desfoque radius={radius.full} style={{ flexDirection: 'row', alignItems: 'center', gap: spacing.xs, padding: 4, minHeight: BARRA }}>
                    {acoes}
                  </Glass>
                ) : null}
              </View>
              <View pointerEvents="box-none" style={{ position: 'absolute', left: 0, right: 0, bottom: insets.bottom + spacing.md,
                alignItems: 'center', gap: spacing.sm }}>
                {aviso ? (
                  <Glass desfoque radius={radius.full} pointerEvents="none" style={{ paddingHorizontal: spacing.md, paddingVertical: spacing.sm }}>
                    <Texto v="legenda" cor={colors.foreground} accessibilityLiveRegion="polite">{aviso}</Texto>
                  </Glass>
                ) : null}
                <BarraDeZoom s={s} limites={limites} pinca={pinca} passo={passo} voltar={voltar} />
              </View>
            </View>
          }
        />
      </GestureHandlerRootView>
    </Modal>
  );
}
