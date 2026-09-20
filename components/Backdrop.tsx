/**
 * Scene backdrop — port of the old site's `--page-backdrop` (globals.css):
 *
 *   radial-gradient(circle at 90% 10%, var(--glow-a)  0%, transparent 65%),
 *   radial-gradient(circle at 10% 90%, var(--glow-b)  0%, transparent 55%),
 *   linear-gradient(135deg, var(--backdrop-from) 0%, var(--backdrop-to) 100%)
 *
 * Drawn with react-native-svg so the two glows are *real* radial gradients.
 * An earlier version faked them with a linear gradient clipped to a rounded
 * square, which left a visible hard arc across the screen — the circle's own
 * edge — instead of a glow that fades out. SVG gradients render identically
 * on web and native, so this is one code path with no platform branch.
 *
 * The Svg uses a 0..1 objectBoundingBox space (`viewBox="0 0 1 1"` with
 * `preserveAspectRatio="none"`), which lets the CSS percentages carry over as
 * literal coordinates and stretches the scene to any window shape.
 *
 * Usage: render <Backdrop /> as the first child of a group layout, behind the
 * content. No props; it never intercepts touches.
 */
import { StyleSheet, View } from 'react-native';
import Svg, {
  Defs,
  LinearGradient,
  RadialGradient,
  Rect,
  Stop,
} from 'react-native-svg';

import { useTheme } from '../theme';

/**
 * Split an `rgba(r,g,b,a)` token into the parts SVG wants separately.
 * The scene tokens are authored as rgba to mirror the CSS hex+alpha values
 * (`--glow-a: #1d2c87d9`), but `<Stop>` takes colour and opacity apart.
 */
function separar(rgba: string): { cor: string; opacidade: number } {
  const m = /rgba?\(\s*([\d.]+)\s*,\s*([\d.]+)\s*,\s*([\d.]+)\s*(?:,\s*([\d.]+)\s*)?\)/.exec(
    rgba,
  );
  if (!m) return { cor: rgba, opacidade: 1 };
  return {
    cor: `rgb(${m[1]},${m[2]},${m[3]})`,
    opacidade: m[4] === undefined ? 1 : Number(m[4]),
  };
}

export default function Backdrop() {
  const { scene } = useTheme();
  const a = separar(scene.glowA);
  const b = separar(scene.glowB);

  return (
    <View pointerEvents="none" style={styles.base}>
      <Svg
        style={StyleSheet.absoluteFill}
        viewBox="0 0 1 1"
        preserveAspectRatio="none"
      >
        <Defs>
          {/* linear-gradient(135deg, from, to): CSS 135deg runs top-left to
              bottom-right, which is the box diagonal in this unit space. */}
          <LinearGradient id="base" x1="0" y1="0" x2="1" y2="1">
            <Stop offset="0" stopColor={scene.backdropFrom} />
            <Stop offset="1" stopColor={scene.backdropTo} />
          </LinearGradient>

          {/* circle at 90% 10%, fading out at 65%. */}
          <RadialGradient id="glowA" cx="0.9" cy="0.1" r="0.65">
            <Stop offset="0" stopColor={a.cor} stopOpacity={a.opacidade} />
            <Stop offset="1" stopColor={a.cor} stopOpacity={0} />
          </RadialGradient>

          {/* circle at 10% 90%, fading out at 55%. */}
          <RadialGradient id="glowB" cx="0.1" cy="0.9" r="0.55">
            <Stop offset="0" stopColor={b.cor} stopOpacity={b.opacidade} />
            <Stop offset="1" stopColor={b.cor} stopOpacity={0} />
          </RadialGradient>
        </Defs>

        {/* Painted bottom-up, the reverse of the CSS layer order. */}
        <Rect x="0" y="0" width="1" height="1" fill="url(#base)" />
        <Rect x="0" y="0" width="1" height="1" fill="url(#glowB)" />
        <Rect x="0" y="0" width="1" height="1" fill="url(#glowA)" />
      </Svg>
    </View>
  );
}

const styles = StyleSheet.create({
  // Absolute inset-0, painted first (and at zIndex 0) so the content that
  // follows it in the tree always covers it.
  base: { position: 'absolute', top: 0, left: 0, right: 0, bottom: 0, zIndex: 0 },
});
