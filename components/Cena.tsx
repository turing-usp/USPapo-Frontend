/**
 * The still scene behind every screen (the old `--page-backdrop`: a 135deg
 * gradient + two radial glows, drawn in SVG so web and native match) and the
 * screen entrance (content rises and fades in on focus; the navigator itself
 * does not animate, so the backdrop never moves).
 */
import { useFocusEffect } from 'expo-router';
import React, { useCallback, useId, useRef, useState, type ReactNode } from 'react';
import { Animated, Easing, StyleSheet, useWindowDimensions, View } from 'react-native';
import Svg, { Defs, LinearGradient, RadialGradient, Rect, Stop } from 'react-native-svg';

import { useTheme } from '../theme';

function rgba(value: string): { cor: string; opacidade: number } {
  const m = /rgba?\(\s*([\d.]+)\s*,\s*([\d.]+)\s*,\s*([\d.]+)\s*(?:,\s*([\d.]+))?\s*\)/.exec(value);
  return m ? { cor: `rgb(${m[1]},${m[2]},${m[3]})`, opacidade: m[4] === undefined ? 1 : Number(m[4]) } : { cor: value, opacidade: 1 };
}

/** `margem` extends the scene past the window on every side (the Android blur target overhang). */
export function Backdrop({ margem = 0 }: { margem?: number }) {
  const { scene } = useTheme();
  const { width, height } = useWindowDimensions();
  const id = useId().replace(/:/g, '');
  const a = rgba(scene.glowA);
  const b = rgba(scene.glowB);
  // The unit square is the window; the margin is drawn outside it, with the same gradient geometry.
  const mx = margem / width;
  const my = margem / height;
  const fora = { x: -mx, y: -my, width: 1 + 2 * mx, height: 1 + 2 * my };
  return (
    <View pointerEvents="none" style={StyleSheet.absoluteFill}>
      {/* Explicit numeric size: percentage props stop react-native-svg painting on web. */}
      <Svg width={width + 2 * margem} height={height + 2 * margem} viewBox={`${fora.x} ${fora.y} ${fora.width} ${fora.height}`}
        preserveAspectRatio="none" style={StyleSheet.absoluteFill}>
        <Defs>
          <LinearGradient id={`base${id}`} x1="0" y1="0" x2="1" y2="1" gradientUnits="userSpaceOnUse">
            <Stop offset="0" stopColor={scene.backdropFrom} />
            <Stop offset="1" stopColor={scene.backdropTo} />
          </LinearGradient>
          <RadialGradient id={`a${id}`} cx="0.9" cy="0.1" r="0.65" gradientUnits="userSpaceOnUse">
            <Stop offset="0" stopColor={a.cor} stopOpacity={a.opacidade} />
            <Stop offset="1" stopColor={a.cor} stopOpacity={0} />
          </RadialGradient>
          <RadialGradient id={`b${id}`} cx="0.1" cy="0.9" r="0.55" gradientUnits="userSpaceOnUse">
            <Stop offset="0" stopColor={b.cor} stopOpacity={b.opacidade} />
            <Stop offset="1" stopColor={b.cor} stopOpacity={0} />
          </RadialGradient>
        </Defs>
        <Rect {...fora} fill={`url(#base${id})`} />
        <Rect {...fora} fill={`url(#b${id})`} />
        <Rect {...fora} fill={`url(#a${id})`} />
      </Svg>
    </View>
  );
}

/**
 * Screen shell used as each stack's `screenLayout`: the entrance replays on every focus. On native,
 * a pushed screen is focused ~80 ms before its first frame, which would hide most of the rise, so
 * the first entrance waits for the screen's first layout.
 */
export function Tela({ children }: { children: ReactNode }) {
  const [entrada] = useState(() => new Animated.Value(0));
  const estado = useRef({ medida: false, pendente: false });
  const animar = useCallback(() => {
    entrada.setValue(0);
    Animated.timing(entrada, { toValue: 1, duration: 220, easing: Easing.out(Easing.cubic), useNativeDriver: true }).start();
  }, [entrada]);
  useFocusEffect(
    useCallback(() => {
      if (estado.current.medida) animar();
      else estado.current.pendente = true;
      return () => {
        estado.current.pendente = false;
        entrada.stopAnimation();
      };
    }, [animar, entrada]),
  );
  const aoMedir = () => {
    if (estado.current.medida) return;
    estado.current.medida = true;
    if (estado.current.pendente) animar();
  };
  const translateY = entrada.interpolate({ inputRange: [0, 1], outputRange: [10, 0] });
  return <Animated.View onLayout={aoMedir} style={{ flex: 1, opacity: entrada, transform: [{ translateY }] }}>{children}</Animated.View>;
}
