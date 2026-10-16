/**
 * Glass surfaces.
 *
 * `desfoque` panes (the small floating controls: menu button, aviso pill, composer,
 * menus) blur EVERYTHING behind them, content included, all with the same glass: the
 * pane's own CSS backdrop-filter on web, the native blur on iOS and, on
 * Android, a hardware RenderEffect blur of the nearest <CamadaDeVidro>
 * background (a BlurView can never sample a target it lives inside, so
 * floating panes are rendered as siblings of what they blur). Large panes (drawer,
 * announcements, menus) are `opaco` instead: the same tint and edges over the canvas, so
 * they look like the glass over the empty (flat) background and cost no blur. Other panes
 * (bubbles, cards, pills inside scrolling content) are a cheap translucent tint.
 *
 * On Android each blurred pane re-renders the whole screen into an offscreen layer every frame
 * anything moves, and the screen itself is re-drawn view by view: while the drawer slid over the
 * chrome and the composer, that took ~10 ms of GPU a frame and missed every other 120 Hz vsync.
 * While a large pane is in play (`useCongelarTela`: the drawer, the giant glass), the screen
 * beneath sits still under the scrim, so it is frozen into one GPU texture: the blurs keep running
 * over it (no visual change, ~5 ms a frame). Switching the blur off instead made the panes flicker.
 */
import { BlurTargetView, BlurView } from 'expo-blur';
import React, {
  createContext, useCallback, useContext, useEffect, useMemo, useRef, useState, type ReactNode, type RefObject,
} from 'react';
import { Animated, PixelRatio, Platform, Pressable, StyleSheet, View, type StyleProp, type ViewStyle } from 'react-native';

import { Backdrop } from './Cena';
import { useTheme, type GlassVariant } from '../theme';

const Alvo = createContext<RefObject<View | null> | null>(null);
const Congelada = createContext(false);
const Congelar = createContext<(motivo: string, ativo: boolean) => void>(() => undefined);
/** Blur strength: one for every floating pane (a Gaussian sigma of INTENSIDADE / 2 dp). */
const INTENSIDADE = 36;
/**
 * Android: the blur clamps the target's edge pixels outward, so text crossing the screen edge would
 * pulse through the status bar and bottom panes while scrolling. The target overhangs the screen by
 * just over 3 sigma of the blur, and the overhang is still backdrop. Every blurred pane renders the
 * whole target (overhang included) into an offscreen layer each frame, whatever its own size, so the
 * overhang is no wider than that.
 */
const MARGEM_ANDROID = 56;
/**
 * The Android BlurView multiplies its radius by 4. (A color filter over it, a hardware layer,
 * re-rasterized every frame and dropped scrolling to ~12 fps.)
 */
const ESCALA_ANDROID = 4;

/**
 * `fundo` (over the canvas) is what the floating glass in `frente` blurs. The canvas
 * lives inside the target so the blurred copy is opaque and fully covers the sharp
 * content underneath.
 */
export function CamadaDeVidro({ fundo, frente }: { fundo: ReactNode; frente: ReactNode }) {
  const alvo = useRef<View | null>(null);
  // Frozen, the screen sits still under the scrim while a large pane slides over it: one GPU
  // texture, drawn once, instead of re-issuing every icon, text and shadow of it each frame.
  const congelada = useContext(Congelada);
  return (
    <View style={styles.flex}>
      {Platform.OS === 'android' ? (
        <BlurTargetView ref={alvo} style={styles.alvo}>
          <View style={StyleSheet.absoluteFill} renderToHardwareTextureAndroid={congelada}>
            <Backdrop />
            <View style={styles.tela}>{fundo}</View>
          </View>
        </BlurTargetView>
      ) : (
        <View style={styles.flex}><Backdrop />{fundo}</View>
      )}
      <Alvo.Provider value={alvo}>{frente}</Alvo.Provider>
    </View>
  );
}

/** Lets large panes freeze the screen beneath them (see the header); wraps a screen group. */
export function CongelamentoDaTela({ children }: { children: ReactNode }) {
  const [motivos, setMotivos] = useState<ReadonlySet<string>>(() => new Set());
  const congelar = useCallback((motivo: string, ativo: boolean) => setMotivos((atual) => {
    if (atual.has(motivo) === ativo) return atual;
    const novo = new Set(atual);
    if (ativo) novo.add(motivo);
    else novo.delete(motivo);
    return novo;
  }), []);
  return (
    <Congelar.Provider value={congelar}>
      <Congelada.Provider value={motivos.size > 0}>{children}</Congelada.Provider>
    </Congelar.Provider>
  );
}

/** While `ativo`, the screen beneath is frozen into a GPU texture (Android). */
export function useCongelarTela(motivo: string, ativo: boolean): void {
  const congelar = useContext(Congelar);
  useEffect(() => {
    congelar(motivo, ativo);
    return () => congelar(motivo, false);
  }, [motivo, ativo, congelar]);
}

/** Native blur layer (web blurs through the pane's own style: see Glass). */
function Desfoque({ intensidade }: { intensidade: number }) {
  const { escuro } = useTheme();
  const alvo = useContext(Alvo);
  const raio = useMemo(() => {
    // The web's blur(intensidade * 0.5 dp) is a Gaussian sigma; RenderEffect takes a radius with
    // sigma = 0.57735 * radius + 0.5, in device px. The effect radius is intensity / reduction * 4,
    // and expo-blur paints a white overlay proportional to intensity, so intensity stays at 1
    // (~0.4% overlay) and the reduction factor carries the radius.
    const sigma = intensidade * 0.5 * (PixelRatio.get() || 1);
    return Math.max(1, (sigma - 0.5) / 0.57735);
  }, [intensidade]);
  if (Platform.OS === 'android') {
    if (!alvo) return null;
    return (
      <BlurView blurTarget={alvo} blurMethod="dimezisBlurViewSdk31Plus" intensity={1}
        blurReductionFactor={ESCALA_ANDROID / raio} tint="default" style={StyleSheet.absoluteFill} />
    );
  }
  return <BlurView intensity={intensidade} tint={escuro ? 'dark' : 'light'} style={StyleSheet.absoluteFill} />;
}

export type GlassProps = {
  children?: ReactNode;
  variante?: GlassVariant;
  desfoque?: boolean;
  /** Opaque glass over the canvas (large panes), instead of a blur. */
  opaco?: boolean;
  radius?: number;
  semBorda?: boolean;
  semSombra?: boolean;
  /** Extra edge styling over the hairline (focus/brand rings). */
  borda?: ViewStyle;
  style?: StyleProp<ViewStyle>;
  /** Fades the whole pane, its blur included (for entrances and exits; not with onPress). */
  opacidade?: Animated.Value | Animated.AnimatedInterpolation<number>;
  onPress?: () => void;
  onLongPress?: () => void;
  disabled?: boolean;
  accessibilityLabel?: string;
  testID?: string;
  pointerEvents?: 'auto' | 'none' | 'box-none' | 'box-only';
};

export default function Glass({
  children, desfoque = false, opaco = false, variante = desfoque || opaco ? 'vidro' : 'surface', radius, semBorda, semSombra, borda, style,
  opacidade, onPress, onLongPress, disabled, accessibilityLabel, testID, pointerEvents,
}: GlassProps) {
  const { colors, glass } = useTheme();
  const plano = StyleSheet.flatten(style) ?? {};
  const raio = radius ?? (plano.borderRadius as number | undefined) ?? 0;
  const sombra = semSombra ? null : glass.shadow;
  // Web: the blur is the pane's own backdrop-filter. An ancestor with opacity < 1 (a fade on a
  // wrapper) cuts a backdrop-filter off from what is behind it, and Chrome keeps it cut off after
  // the fade ends; the pane's own opacity (`opacidade`) fades it with its blur. A plain blur, like
  // Android's: saturating it would push the colors behind the glass off the palette.
  const filtro = desfoque && Platform.OS === 'web'
    ? ({ backdropFilter: `blur(${Math.round(INTENSIDADE * 0.5)}px)` } as ViewStyle) : null;
  // zIndex 0 makes the pane its own stacking context so the layers (zIndex -1) sit behind every
  // child on web too, including static ones like <svg> and <input>.
  const base = [plano, sombra, filtro, { borderRadius: raio, zIndex: plano.zIndex ?? 0 }];
  // The hairline colors each side, and a side's color beats `borderColor`: an edge color (the
  // composer's orange, a focus ring) has to go on every side to show.
  const cor = borda?.borderColor;
  const contorno = cor ? { ...borda, borderTopColor: cor, borderRightColor: cor, borderBottomColor: cor, borderLeftColor: cor } : borda;

  const camadas = (
    <>
      <View pointerEvents="none" style={[StyleSheet.absoluteFill, styles.atras, { borderRadius: raio, overflow: 'hidden' }]}>
        {desfoque && Platform.OS !== 'web' ? <Desfoque intensidade={INTENSIDADE} /> : null}
        {opaco ? <View style={[StyleSheet.absoluteFill, { backgroundColor: colors.canvas }]} /> : null}
        <View style={[StyleSheet.absoluteFill, { backgroundColor: glass.tint[variante] }]} />
      </View>
      {semBorda ? null : (
        <View pointerEvents="none" style={[StyleSheet.absoluteFill, styles.atras, { borderRadius: raio }, glass.hairline, contorno]} />
      )}
      {children}
    </>
  );

  if (onPress || onLongPress) {
    return (
      <Pressable
        onPress={onPress}
        onLongPress={onLongPress}
        disabled={disabled}
        accessibilityRole="button"
        accessibilityLabel={accessibilityLabel}
        testID={testID}
        style={({ pressed }) => [...base, pressed && { opacity: 0.85 }]}
      >
        {camadas}
      </Pressable>
    );
  }
  return (
    <Animated.View style={[...base, opacidade ? { opacity: opacidade } : null]} testID={testID} pointerEvents={pointerEvents}
      accessibilityLabel={accessibilityLabel}>
      {camadas}
    </Animated.View>
  );
}

const styles = StyleSheet.create({
  flex: { flex: 1 },
  atras: { zIndex: -1 },
  alvo: { position: 'absolute', top: -MARGEM_ANDROID, right: -MARGEM_ANDROID, bottom: -MARGEM_ANDROID, left: -MARGEM_ANDROID },
  tela: { position: 'absolute', top: MARGEM_ANDROID, right: MARGEM_ANDROID, bottom: MARGEM_ANDROID, left: MARGEM_ANDROID },
});
