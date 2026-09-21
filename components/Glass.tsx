/**
 * The glass surface, with real blur.
 *
 * This is the old site's `.glass` blade: a blurred, tinted pane with a bright
 * top filament and a soft lift. React Native has no `backdrop-filter`, so the
 * pane is built per platform — and, importantly, both platforms blur THE SAME
 * THING: the scene, and only the scene.
 *
 *   native  `expo-blur` over the <BlurTargetView> that components/Cena wraps
 *           around the backdrop. Android's BlurView samples that target and
 *           paints it as its own background, so app content behind the pane
 *           is covered, never blurred.
 *
 *   web     a COPY of the scene, painted with `background-attachment: fixed`
 *           so it lines up with the real backdrop pixel for pixel, clipped to
 *           the pane. `backdrop-filter` used to do this job, and it sampled
 *           *everything* underneath — the answer text scrolling behind the
 *           composer and the chrome came through blurred, which native never
 *           did. A fixed-attachment background needs no measurement, survives
 *           scrolling and resizing for free, and blurring a smooth two-glow
 *           gradient is visually a no-op anyway (the old site's globals.css
 *           says as much: "borrar um gradiente liso com 44px quase não o
 *           muda").
 *
 * Structure matters for correctness:
 *
 *   outer  — carries the shadow, which must NOT be clipped
 *   clip   — `overflow: hidden` + the radius, so the blur and tint are
 *            rounded with the card, and the hairline edge sits on top
 *   blur   — the pane itself (BlurView on native, scene copy on web)
 *   tint   — the calibrated colour over the blur (`--glass-tint`)
 *
 * A shadow and `overflow: hidden` cannot live on the same view: the shadow
 * would be clipped away. Hence the two wrappers.
 */
import React, { type ReactNode } from 'react';
import {
  PixelRatio,
  Platform,
  Pressable,
  StyleSheet,
  View,
  type ViewStyle,
} from 'react-native';
import { BlurView } from 'expo-blur';

import { cenaComoCss } from './Backdrop';
import { useAlvoDeVidro } from './Cena';
import { useTheme, type Scheme, type SceneColors } from '../theme';

export type VarianteVidro = 'surface' | 'panel' | 'raised' | 'brand';

/**
 * Blur strength per variant (expo-blur's 0-100 scale), mapped from the old
 * CSS: `--glass-blur: 44px` for normal glass, `80px` for the drawer panel.
 * Android blurs on the render thread, so the values stay moderate — beyond
 * roughly 60 the cost climbs with no visible gain at these tints.
 *
 * The number also drives the TINT on both platforms (expo-blur derives its
 * overlay alpha from the intensity), so it is kept identical everywhere and
 * only the radius is corrected per platform — see `reducaoAndroid`.
 */
const INTENSIDADE: Record<VarianteVidro, number> = {
  surface: 32,
  panel: 48,
  raised: 40,
  brand: 28,
};

/**
 * Android divides the blur radius by this before handing it to RenderEffect,
 * and the radius it ends up with is in DEVICE pixels — while expo-blur's web
 * build asks for `intensity * 0.2` CSS pixels, which are density independent.
 * With the library default (4) the two never agreed on any screen; a fixed 2
 * only happened to agree at one density.
 *
 * Solving `intensity / reducao = intensity * 0.2 * density` for the reduction
 * gives `5 / density`, which lands the Android pane on the same blur the web
 * build gets, on every screen.
 */
function reducaoAndroid(): number {
  const densidade = PixelRatio.get() || 1;
  return 5 / densidade;
}

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

/**
 * expo-blur's own veil, reproduced so the web pane keeps the exact tone it
 * had while it was a BlurView: `getBackgroundColor(intensity, tint)` on web
 * and `TintStyle.toBlurEffect` on Android are the same two formulas.
 */
function veuDoVidro(scheme: Scheme, intensidade: number): string {
  const opacidade = Math.min(intensidade, 100) / 100;
  return scheme === 'dark'
    ? `rgba(25,25,25,${(opacidade * 0.78).toFixed(3)})`
    : `rgba(249,249,249,${(opacidade * 0.78).toFixed(3)})`;
}

/**
 * The web pane: a fixed-attachment copy of the scene under expo-blur's veil.
 *
 * Written as a raw `div` on purpose — `backgroundImage` /
 * `backgroundAttachment` are not part of the React Native style vocabulary,
 * and react-native-web drops what it does not know. The element is inside a
 * `overflow: hidden` clip layer, which is what turns the window-sized
 * background into the pane's own piece of the scene.
 */
function CenaFixa({ scene, veu }: { scene: SceneColors; veu: string }) {
  return React.createElement(
    'div',
    {
      style: {
        position: 'absolute',
        inset: 0,
        backgroundImage: cenaComoCss(scene),
        backgroundAttachment: 'fixed, fixed, fixed',
        backgroundRepeat: 'no-repeat',
        backgroundSize: '100vw 100vh',
        backgroundPosition: '0 0',
      },
    },
    React.createElement('div', {
      style: { position: 'absolute', inset: 0, backgroundColor: veu },
    }),
  );
}

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
  const { scheme, glass, scene } = useTheme();
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
      {/* `pointerEvents="none"` is load-bearing, not tidiness: this layer is
          absolutely positioned and the children are in normal flow, and CSS
          paints positioned boxes ABOVE static ones whatever the DOM order.
          Without it the blur pane sits over the content on web and swallows
          every click — inputs never took focus from the mouse. */}
      <View
        pointerEvents="none"
        style={[
          StyleSheet.absoluteFill,
          { borderRadius: raio, overflow: 'hidden' },
        ]}
      >
        {Platform.OS === 'web' ? (
          <CenaFixa scene={scene} veu={veuDoVidro(scheme, INTENSIDADE[variante])} />
        ) : (
          <BlurView
            blurTarget={alvo ?? undefined}
            intensity={INTENSIDADE[variante]}
            tint={scheme === 'dark' ? 'dark' : 'light'}
            // Android does not blur at all by default. `dimezisBlurViewSdk31Plus`
            // is the hardware path (RenderEffect, API 31+), which is both the
            // cheapest real blur on modern devices and free of the software
            // method's banding artefacts. (`experimentalBlurMethod` is the old
            // name for this prop and now logs a deprecation warning per pane.)
            blurMethod={
              Platform.OS === 'android' ? 'dimezisBlurViewSdk31Plus' : undefined
            }
            blurReductionFactor={
              Platform.OS === 'android' ? reducaoAndroid() : undefined
            }
            style={StyleSheet.absoluteFill}
          />
        )}
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
