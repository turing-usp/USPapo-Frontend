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
 * content. No props; it never intercepts touches. For the edge dissolve, see
 * <BackdropDesvanecido /> at the bottom of this file.
 */
import React, { useId } from 'react';
import { StyleSheet, useWindowDimensions, View } from 'react-native';
import Svg, {
  Defs,
  G,
  LinearGradient,
  Mask,
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

/** Which edge of the screen keeps the scene solid before it dissolves. */
export type LadoDesvanecido = 'topo' | 'base';

export type DesvanecerProps = {
  lado: LadoDesvanecido;
  /** How far the solid band reaches from that edge, in pt. */
  solido: number;
  /** Length of the dissolve after the solid band (old site: 2.5rem). */
  cauda?: number;
};

/** The old site's `calc(var(--fade-solido) + 2.5rem)` tail. */
const CAUDA_PADRAO = 40;

type BackdropProps = {
  /**
   * When set, the scene is painted through a vertical mask: fully opaque
   * for `solido` pt from `lado`, then fading out over `cauda` pt. Used by
   * the edge overlays; the base scene leaves this undefined.
   */
  desvanecer?: DesvanecerProps;
};

export default function Backdrop({ desvanecer }: BackdropProps = {}) {
  const { scene } = useTheme();
  // The scene always covers the window; measuring it gives the Svg a
  // concrete size and re-renders on resize / rotation.
  const { width: largura, height: altura } = useWindowDimensions();
  const a = separar(scene.glowA);
  const b = separar(scene.glowB);

  /**
   * Ids are per-instance. Several backdrops are on screen at once (the base
   * scene plus the two edge overlays), and on web they all land in ONE
   * document — hardcoded ids would collide and every instance would resolve
   * to whichever `<defs>` came first, including the wrong mask.
   */
  const uid = useId().replace(/:/g, '');
  const idBase = `base-${uid}`;
  const idGlowA = `glowA-${uid}`;
  const idGlowB = `glowB-${uid}`;
  const idMascara = `fade-${uid}`;
  const idMascaraGrad = `fadeGrad-${uid}`;

  // The mask lives in the same 0..1 space as everything else, so the pt
  // measurements are divided by the window height to get there.
  const cauda = desvanecer?.cauda ?? CAUDA_PADRAO;
  const solidoFrac = altura > 0 ? Math.min(desvanecer?.solido ?? 0, altura) / altura : 0;
  const caudaFrac = altura > 0 ? cauda / altura : 0;
  const doTopo = desvanecer?.lado === 'topo';

  const camadas = (
    <>
      {/* Painted bottom-up, the reverse of the CSS layer order. */}
      <Rect x="0" y="0" width="1" height="1" fill={`url(#${idBase})`} />
      <Rect x="0" y="0" width="1" height="1" fill={`url(#${idGlowB})`} />
      <Rect x="0" y="0" width="1" height="1" fill={`url(#${idGlowA})`} />
    </>
  );

  return (
    <View pointerEvents="none" style={styles.base}>
      {/* The size is passed as explicit numbers, and both parts matter.
          Without any width/height the browser has no used size for a replaced
          element and falls back to the viewBox's intrinsic 1:1 ratio, so the
          scene rendered as a WIDTH x WIDTH square and the bottom-left glow sat
          below the fold on every landscape window. Percentage props ("100%")
          size the element correctly but stop react-native-svg painting it at
          all on web, so the window measurement is what gets handed over. */}
      <Svg
        width={largura}
        height={altura}
        style={StyleSheet.absoluteFill}
        viewBox="0 0 1 1"
        preserveAspectRatio="none"
      >
        <Defs>
          {/* linear-gradient(135deg, from, to): CSS 135deg runs top-left to
              bottom-right, which is the box diagonal in this unit space. */}
          <LinearGradient id={idBase} x1="0" y1="0" x2="1" y2="1">
            <Stop offset="0" stopColor={scene.backdropFrom} />
            <Stop offset="1" stopColor={scene.backdropTo} />
          </LinearGradient>

          {/* circle at 90% 10%, fading out at 65%. */}
          <RadialGradient id={idGlowA} cx="0.9" cy="0.1" r="0.65">
            <Stop offset="0" stopColor={a.cor} stopOpacity={a.opacidade} />
            <Stop offset="1" stopColor={a.cor} stopOpacity={0} />
          </RadialGradient>

          {/* circle at 10% 90%, fading out at 55%. */}
          <RadialGradient id={idGlowB} cx="0.1" cy="0.9" r="0.55">
            <Stop offset="0" stopColor={b.cor} stopOpacity={b.opacidade} />
            <Stop offset="1" stopColor={b.cor} stopOpacity={0} />
          </RadialGradient>

          {desvanecer ? (
            <>
              {/* White keeps the pixel, black drops it. */}
              <LinearGradient
                id={idMascaraGrad}
                x1="0"
                y1={doTopo ? '0' : '1'}
                x2="0"
                y2={doTopo ? '1' : '0'}
              >
                <Stop offset="0" stopColor="#fff" stopOpacity={1} />
                <Stop offset={solidoFrac} stopColor="#fff" stopOpacity={1} />
                <Stop offset={solidoFrac + caudaFrac} stopColor="#fff" stopOpacity={0} />
                <Stop offset="1" stopColor="#fff" stopOpacity={0} />
              </LinearGradient>
              <Mask id={idMascara}>
                <Rect x="0" y="0" width="1" height="1" fill={`url(#${idMascaraGrad})`} />
              </Mask>
            </>
          ) : null}
        </Defs>

        {desvanecer ? <G mask={`url(#${idMascara})`}>{camadas}</G> : camadas}
      </Svg>
    </View>
  );
}

/**
 * The edge dissolve — port of the old site's `page-fade-b` / `page-fade-t`
 * utilities (globals.css).
 *
 * The trick is the old one, and it is worth stating because it is not what
 * it looks like: this does NOT fade the content. It repaints the SAME scene
 * on top of the content, through a mask that is solid at the edge and
 * transparent further in. The content therefore dissolves into the backdrop
 * rather than into a flat colour — which is the only thing that works here,
 * because the backdrop is a gradient with two glows and any solid-colour
 * scrim would show as a band across it.
 *
 * Rendered ABOVE the screen content and below the floating chrome. It never
 * takes touches (the View inside Backdrop is `pointerEvents="none"`).
 */
export function BackdropDesvanecido(props: DesvanecerProps) {
  return <Backdrop desvanecer={props} />;
}

const styles = StyleSheet.create({
  // Absolute inset-0, painted first (and at zIndex 0) so the content that
  // follows it in the tree always covers it.
  base: { position: 'absolute', top: 0, left: 0, right: 0, bottom: 0, zIndex: 0 },
});

/**
 * The scene as a CSS `background-image`, for the web glass panes.
 *
 * Same three layers as the SVG above, in the same order, written as CSS
 * gradients so a pane can paint a COPY of the scene instead of sampling
 * whatever happens to be behind it. The radial layers are sized `65% 65%` /
 * `55% 55%` because the SVG stretches its unit circles with
 * `preserveAspectRatio="none"` — an ellipse of those radii, not a circle —
 * and the base uses `to bottom right`, which is the box diagonal for any
 * window shape (the SVG's 0,0 → 1,1 line).
 *
 * `transparent` is avoided on purpose: browsers interpolate it as
 * transparent BLACK, which greys the middle of the ramp. The same colour at
 * zero alpha keeps the ramp clean.
 */
export function cenaComoCss(cores: {
  backdropFrom: string;
  backdropTo: string;
  glowA: string;
  glowB: string;
}): string {
  const a = separar(cores.glowA);
  const b = separar(cores.glowB);
  const aZero = `${a.cor.replace(/^rgb\(/, 'rgba(').replace(/\)$/, ',0)')}`;
  const bZero = `${b.cor.replace(/^rgb\(/, 'rgba(').replace(/\)$/, ',0)')}`;
  const aCheio = `${a.cor.replace(/^rgb\(/, 'rgba(').replace(/\)$/, `,${a.opacidade})`)}`;
  const bCheio = `${b.cor.replace(/^rgb\(/, 'rgba(').replace(/\)$/, `,${b.opacidade})`)}`;
  return [
    `radial-gradient(65% 65% at 90% 10%, ${aCheio} 0%, ${aZero} 100%)`,
    `radial-gradient(55% 55% at 10% 90%, ${bCheio} 0%, ${bZero} 100%)`,
    `linear-gradient(to bottom right, ${cores.backdropFrom} 0%, ${cores.backdropTo} 100%)`,
  ].join(', ');
}
