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
const ANDROID_OVERLAY = 5;

/**
 * `fundo` (over the scene backdrop) is what the floating glass in `frente` blurs.
 * The backdrop lives inside the target so the blurred copy is opaque and fully
 * covers the sharp content underneath.
 */
export function CamadaDeVidro({ fundo, frente }: { fundo: ReactNode; frente: ReactNode }) {
  const alvo = useRef<View | null>(null);
  const conteudo = <><Backdrop />{fundo}</>;
  return (
    <View style={styles.flex}>
      {Platform.OS === 'android' ? (
        <BlurTargetView ref={alvo} style={styles.flex}>{conteudo}</BlurTargetView>
      ) : (
        <View style={styles.flex}>{conteudo}</View>
      )}
      <Alvo.Provider value={alvo}>{frente}</Alvo.Provider>
    </View>
  );
}

function Desfoque({ intensidade }: { intensidade: number }) {
  const { scheme } = useTheme();
  const alvo = useContext(Alvo);
  if (Platform.OS === 'web') {
    const filtro = `blur(${Math.round(intensidade * 0.5)}px) saturate(150%)`;
    return React.createElement('div', {
      style: { position: 'absolute', inset: 0, backdropFilter: filtro, WebkitBackdropFilter: filtro },
    });
  }
  if (Platform.OS === 'android') {
    if (!alvo) return null;
    // expo-blur paints a white overlay proportional to `intensity` on top of our tint, hiding the
    // blurred content. Keep it ~2% and take the radius (intensity / reduction, in device px) from
    // the reduction factor instead: the web's intensity * 0.5 dp, with our tint as the only tint.
    return (
      <BlurView
        blurTarget={alvo}
        blurMethod="dimezisBlurViewSdk31Plus"
        intensity={ANDROID_OVERLAY}
        blurReductionFactor={ANDROID_OVERLAY / (intensidade * 0.5 * (PixelRatio.get() || 1))}
        tint="default"
        style={StyleSheet.absoluteFill}
      />
    );
  }
  return <BlurView intensity={intensidade} tint={scheme === 'dark' ? 'dark' : 'light'} style={StyleSheet.absoluteFill} />;
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
  // Android elevation on a translucent view paints a hard box: the lift is iOS/web only.
  const sombra = semSombra || Platform.OS === 'android' ? null : glass.shadow;
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

const styles = StyleSheet.create({ flex: { flex: 1 }, atras: { zIndex: -1 } });
