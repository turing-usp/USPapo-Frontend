/**
 * Scene backdrop — port of the old site's `--page-backdrop` (globals.css):
 * a 135deg linear base (backdropFrom → backdropTo) with two soft radial
 * glows — top-right (~0.9 / 0.1) and bottom-left (~0.1 / 0.9). Orange
 * glows in the light scheme, blue in dark.
 *
 * Approximation (documented): the old app used real CSS radial gradients
 * and glass on top of them via backdrop-filter blur(44px), which are not
 * portable to React Native. Each radial is emulated with a large rounded
 * square centered on the same point as the CSS circle; its size follows
 * the CSS fade stops (glow A fades out at 65%, glow B at 55%, so B is a
 * touch smaller). A LinearGradient runs from the square's center to its
 * far corner, so the two edges that stay on screen fade to transparent
 * while the near edges sit off-screen — a soft, tonal glow instead of a
 * hard circle.
 *
 * Usage: render <Backdrop /> as the first child of a screen or group
 * layout, behind the content. No props; it never intercepts touches.
 */
import { Dimensions, StyleSheet, View } from 'react-native';
import { LinearGradient } from 'expo-linear-gradient';

import { useTheme } from '../theme';

const INVISIVEL = 'rgba(0,0,0,0)';

export default function Backdrop() {
  const { scene } = useTheme();
  const { width, height } = Dimensions.get('window');

  const sizeA = Math.round(height * 0.65);
  const sizeB = Math.round(height * 0.55);

  return (
    <View pointerEvents="none" style={styles.base}>
      {/* Base 135deg gradient, same stops as the old --page-backdrop. */}
      <LinearGradient
        style={styles.fill}
        colors={[scene.backdropFrom, scene.backdropTo]}
        start={{ x: 0.15, y: 0 }}
        end={{ x: 0.85, y: 1 }}
      />

      {/* Glow A: top-right (~0.9 / 0.1), fading toward its far corner,
          which is the bottom-left of the square (its top/right edges are
          off-screen by design). */}
      <LinearGradient
        style={[
          styles.glow,
          {
            width: sizeA,
            height: sizeA,
            left: width * 0.9 - sizeA / 2,
            top: height * 0.1 - sizeA / 2,
            borderRadius: sizeA / 2,
          },
        ]}
        colors={[scene.glowA, scene.glowA, INVISIVEL]}
        locations={[0, 0.5, 1]}
        start={{ x: 0.5, y: 0.5 }}
        end={{ x: 0, y: 1 }}
      />

      {/* Glow B: bottom-left (~0.1 / 0.9), fading toward the top-right. */}
      <LinearGradient
        style={[
          styles.glow,
          {
            width: sizeB,
            height: sizeB,
            left: width * 0.1 - sizeB / 2,
            top: height * 0.9 - sizeB / 2,
            borderRadius: sizeB / 2,
          },
        ]}
        colors={[scene.glowB, scene.glowB, INVISIVEL]}
        locations={[0, 0.5, 1]}
        start={{ x: 0.5, y: 0.5 }}
        end={{ x: 1, y: 0 }}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  // Absolute inset-0, painted first (and at zIndex 0) so the content that
  // follows it in the tree always covers it.
  base: { position: 'absolute', top: 0, left: 0, right: 0, bottom: 0, zIndex: 0 },
  fill: { position: 'absolute', top: 0, left: 0, right: 0, bottom: 0 },
  glow: { position: 'absolute' },
});
