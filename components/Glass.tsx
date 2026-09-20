/**
 * The glass surface, with real blur.
 *
 * This is the old site's `.glass` blade: a blurred, tinted pane with a bright
 * top filament and a soft lift. Until now the port used a flat opaque fill,
 * because React Native has no `backdrop-filter`. `expo-blur` is the native
 * answer — `UIVisualEffectView` on iOS, `RenderEffect` on Android 12+, and
 * `backdrop-filter` on web — so it is the cheapest real blur available on
 * each platform rather than a JS approximation.
 *
 * Structure matters for correctness:
 *
 *   outer  — carries the shadow, which must NOT be clipped
 *   clip   — `overflow: hidden` + the radius, so the blur and tint are
 *            rounded with the card, and the hairline edge sits on top
 *   blur   — the pane itself
 *   tint   — the calibrated colour over the blur (`--glass-tint`)
 *
 * A shadow and `overflow: hidden` cannot live on the same view: the shadow
 * would be clipped away. Hence the two wrappers.
 */
import React, { type ReactNode } from 'react';
import {
  Platform,
  Pressable,
  StyleSheet,
  View,
  type ViewStyle,
} from 'react-native';
import { BlurView } from 'expo-blur';

import { useAlvoDeVidro } from './Cena';
import { useTheme, type Scheme } from '../theme';

export type VarianteVidro = 'surface' | 'panel' | 'raised' | 'brand';

/**
 * Blur strength per variant (expo-blur's 0-100 scale), mapped from the old
 * CSS: `--glass-blur: 44px` for normal glass, `80px` for the drawer panel.
 * Android blurs on the render thread, so the values stay moderate — beyond
 * roughly 60 the cost climbs with no visible gain at these tints.
 */
const INTENSIDADE: Record<VarianteVidro, number> = {
  surface: 32,
  panel: 48,
  raised: 40,
  brand: 28,
};

/**
 * Tint painted over the blur. These are the translucent `--glass-tint`
 * values, NOT the flat `--glass-opaco` fallbacks: with a real blur behind
 * them the surface has to stay see-through or the blur is wasted.
 */
const TINTA: Record<Scheme, Record<VarianteVidro, string>> = {
  light: {
    surface: 'rgba(238,239,255,0.25)',
    panel: 'rgba(255,255,255,0.35)',
    raised: 'rgba(255,255,255,0.45)',
    brand: 'rgba(238,239,255,0.18)',
  },
  dark: {
    surface: 'rgba(13,25,131,0.30)',
    panel: 'rgba(8,17,101,0.42)',
    raised: 'rgba(3,29,187,0.34)',
    brand: 'rgba(13,25,131,0.22)',
  },
};

export type GlassProps = {
  children?: ReactNode;
  variante?: VarianteVidro;
  /** Corner radius; applied to the clipping layer so the blur follows it. */
  radius?: number;
  /** Drop the hairline edge (for surfaces that draw their own, e.g. focus). */
  semBorda?: boolean;
  /** Drop the lift (nested glass should not stack shadows). */
  semSombra?: boolean;
  /** Layout/spacing for the card; borderRadius here is honoured too. */
  style?: ViewStyle | ViewStyle[];
  /** Extra border styling merged over the hairline (brand/focus edges). */
  borda?: ViewStyle;
  pointerEvents?: 'auto' | 'none' | 'box-none' | 'box-only';
  /**
   * Makes the whole pane tappable. Many glass surfaces are buttons (pills,
   * list rows, chips); rendering the Pressable as the outer view keeps the
   * hit area identical to the card instead of nesting one inside it.
   */
  onPress?: () => void;
  onLongPress?: () => void;
  disabled?: boolean;
  accessibilityLabel?: string;
  /** Analytics tests select tiles by testID. */
  testID?: string;
};

export default function Glass({
  children,
  variante = 'surface',
  radius,
  semBorda = false,
  semSombra = false,
  style,
  borda,
  pointerEvents,
  onPress,
  onLongPress,
  disabled,
  accessibilityLabel,
  testID,
}: GlassProps) {
  const { scheme, glass } = useTheme();
  // Android blurs only when handed a target to sample (see components/Cena).
  const alvo = useAlvoDeVidro();

  const plano = StyleSheet.flatten(style) ?? {};
  const raio = radius ?? (plano.borderRadius as number | undefined) ?? 0;

  // The outer view keeps only what must not be clipped (the shadow) plus the
  // box metrics; padding and content styling belong on the inner content.
  const { ...resto } = plano;
  /**
   * Android's `elevation` needs an opaque background to cast a shadow; on a
   * transparent pane it instead paints a hard rectangle behind the rounded
   * card — the stray "box" that showed through some surfaces. The blur and
   * the hairline already carry the depth there, so elevation is dropped and
   * only iOS/web keep the soft lift.
   */
  const sombra: ViewStyle | null = semSombra
    ? null
    : Platform.OS === 'android'
      ? null
      : (glass.shadow as ViewStyle);

  const base: ViewStyle[] = [
    resto,
    ...(sombra ? [sombra] : []),
    { borderRadius: raio, backgroundColor: 'transparent' },
  ];

  const conteudo = (
    <>
      <View
        style={[
          StyleSheet.absoluteFill,
          { borderRadius: raio, overflow: 'hidden' },
        ]}
      >
        <BlurView
          blurTarget={alvo ?? undefined}
          intensity={INTENSIDADE[variante]}
          tint={scheme === 'dark' ? 'dark' : 'light'}
          // Android does not blur at all by default. `dimezisBlurViewSdk31Plus`
          // is the hardware path (RenderEffect, API 31+), which is both the
          // cheapest real blur on modern devices and free of the software
          // method's banding artefacts.
          experimentalBlurMethod={
            Platform.OS === 'android' ? 'dimezisBlurViewSdk31Plus' : undefined
          }
          style={StyleSheet.absoluteFill}
        />
        <View
          style={[
            StyleSheet.absoluteFill,
            { backgroundColor: TINTA[scheme][variante] },
          ]}
        />
      </View>

      {/* The edge sits above the blur, as a non-clipping overlay so it stays
          crisp at the exact radius. */}
      {semBorda ? null : (
        <View
          pointerEvents="none"
          style={[
            StyleSheet.absoluteFill,
            { borderRadius: raio },
            glass.hairline,
            borda,
          ]}
        />
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
        accessibilityLabel={accessibilityLabel}
        accessibilityRole="button"
        testID={testID}
        style={({ pressed }) => [...base, pressed ? { opacity: 0.85 } : null]}
      >
        {conteudo}
      </Pressable>
    );
  }

  return (
    <View pointerEvents={pointerEvents} style={base} testID={testID}>
      {conteudo}
    </View>
  );
}
