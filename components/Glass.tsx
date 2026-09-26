/**
 * Glass surfaces.
 *
 * `desfoque` panes (floating chrome, composer, drawer) blur EVERYTHING behind
 * them, content included: CSS backdrop-filter on web, the native blur on iOS
 * and, on Android, a hardware RenderEffect blur of the nearest <CamadaDeVidro>
 * background (a BlurView can never sample a target it lives inside, so floating
 * panes are rendered as siblings of what they blur). Other panes (bubbles,
 * cards, pills inside scrolling content) are a cheap translucent tint.
 */
import { BlurTargetView, BlurView } from 'expo-blur';
import React, { createContext, useContext, useRef, type ReactNode, type RefObject } from 'react';
import { PixelRatio, Platform, Pressable, StyleSheet, View, type StyleProp, type ViewStyle } from 'react-native';

import { Backdrop } from './Cena';
import { useTheme, type GlassVariant } from '../theme';

const Alvo = createContext<RefObject<View | null> | null>(null);
const INTENSIDADE: Record<GlassVariant, number> = { surface: 36, panel: 48, raised: 40, brand: 32 };
/**
 * Android: the blur clamps the target's edge pixels outward, so text crossing the screen edge would
 * pulse through the status bar and bottom panes while scrolling. The target overhangs the screen by
 * more than 3 sigma of the widest blur, and the overhang is still backdrop.
 */
const MARGEM_ANDROID = 80;
/**
 * The Android BlurView multiplies its radius by 4. It also has no `saturate(150%)` like the web: a
 * color filter over it (a hardware layer) re-rasterized every frame and dropped scrolling to ~12 fps.
 */
const ESCALA_ANDROID = 4;

/**
 * `fundo` (over the scene backdrop) is what the floating glass in `frente` blurs.
 * The backdrop lives inside the target so the blurred copy is opaque and fully
 * covers the sharp content underneath.
 */
export function CamadaDeVidro({ fundo, frente }: { fundo: ReactNode; frente: ReactNode }) {
  const alvo = useRef<View | null>(null);
  return (
    <View style={styles.flex}>
      {Platform.OS === 'android' ? (
        <BlurTargetView ref={alvo} style={styles.alvo}>
          <Backdrop margem={MARGEM_ANDROID} />
          <View style={styles.tela}>{fundo}</View>
        </BlurTargetView>
      ) : (
        <View style={styles.flex}><Backdrop />{fundo}</View>
      )}
      <Alvo.Provider value={alvo}>{frente}</Alvo.Provider>
    </View>
  );
}

function Desfoque({ intensidade }: { intensidade: number }) {
  const { escuro } = useTheme();
  const alvo = useContext(Alvo);
  if (Platform.OS === 'web') {
    const filtro = `blur(${Math.round(intensidade * 0.5)}px) saturate(150%)`;
    return React.createElement('div', {
      style: { position: 'absolute', inset: 0, backdropFilter: filtro, WebkitBackdropFilter: filtro },
    });
  }
  if (Platform.OS === 'android') {
    if (!alvo) return null;
    // The web's blur(intensidade * 0.5 dp) is a Gaussian sigma; RenderEffect takes a radius with
    // sigma = 0.57735 * radius + 0.5, in device px. The effect radius is intensity / reduction * 4,
    // and expo-blur paints a white overlay proportional to intensity, so intensity stays at 1
    // (~0.4% overlay) and the reduction factor carries the radius.
    const sigma = intensidade * 0.5 * (PixelRatio.get() || 1);
    const raio = Math.max(1, (sigma - 0.5) / 0.57735);
    return (
      <BlurView blurTarget={alvo} blurMethod="dimezisBlurViewSdk31Plus" intensity={1} blurReductionFactor={ESCALA_ANDROID / raio}
        tint="default" style={StyleSheet.absoluteFill} />
    );
  }
  return <BlurView intensity={intensidade} tint={escuro ? 'dark' : 'light'} style={StyleSheet.absoluteFill} />;
}

export type GlassProps = {
  children?: ReactNode;
  variante?: GlassVariant;
  desfoque?: boolean;
  radius?: number;
  semBorda?: boolean;
  semSombra?: boolean;
  /** Extra edge styling over the hairline (focus/brand rings). */
  borda?: ViewStyle;
  style?: StyleProp<ViewStyle>;
  onPress?: () => void;
  onLongPress?: () => void;
  disabled?: boolean;
  accessibilityLabel?: string;
  testID?: string;
  pointerEvents?: 'auto' | 'none' | 'box-none' | 'box-only';
};

export default function Glass({
  children, variante = 'surface', desfoque = false, radius, semBorda, semSombra, borda, style,
  onPress, onLongPress, disabled, accessibilityLabel, testID, pointerEvents,
}: GlassProps) {
  const { glass } = useTheme();
  const plano = StyleSheet.flatten(style) ?? {};
  const raio = radius ?? (plano.borderRadius as number | undefined) ?? 0;
  const sombra = semSombra ? null : glass.shadow;
  // zIndex 0 makes the pane its own stacking context so the layers (zIndex -1) sit behind every
  // child on web too, including static ones like <svg> and <input>.
  const base = [plano, sombra, { borderRadius: raio, zIndex: plano.zIndex ?? 0 }];

  const camadas = (
    <>
      <View pointerEvents="none" style={[StyleSheet.absoluteFill, styles.atras, { borderRadius: raio, overflow: 'hidden' }]}>
        {desfoque ? <Desfoque intensidade={INTENSIDADE[variante]} /> : null}
        <View style={[StyleSheet.absoluteFill, { backgroundColor: glass.tint[variante] }]} />
      </View>
      {semBorda ? null : (
        <View pointerEvents="none" style={[StyleSheet.absoluteFill, styles.atras, { borderRadius: raio }, glass.hairline, borda]} />
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
    <View style={base} testID={testID} pointerEvents={pointerEvents} accessibilityLabel={accessibilityLabel}>
      {camadas}
    </View>
  );
}

const styles = StyleSheet.create({
  flex: { flex: 1 },
  atras: { zIndex: -1 },
  alvo: { position: 'absolute', top: -MARGEM_ANDROID, right: -MARGEM_ANDROID, bottom: -MARGEM_ANDROID, left: -MARGEM_ANDROID },
  tela: { position: 'absolute', top: MARGEM_ANDROID, right: MARGEM_ANDROID, bottom: MARGEM_ANDROID, left: MARGEM_ANDROID },
});
