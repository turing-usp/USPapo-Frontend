/**
 * The still scene behind every screen (the old `--page-backdrop`: a 135deg
 * gradient + two radial glows, drawn in SVG so web and native match) and the
 * screen entrance (content rises and fades in on focus; the navigator itself
 * does not animate, so the backdrop never moves).
 */
import { useFocusEffect } from 'expo-router';
import React, { useCallback, useId, useState, type ReactNode } from 'react';
import { Animated, Easing, StyleSheet, useWindowDimensions, View } from 'react-native';
import Svg, { Defs, LinearGradient, RadialGradient, Rect, Stop } from 'react-native-svg';

import { useTheme } from '../theme';

function rgba(value: string): { cor: string; opacidade: number } {
  const m = /rgba?\(\s*([\d.]+)\s*,\s*([\d.]+)\s*,\s*([\d.]+)\s*(?:,\s*([\d.]+))?\s*\)/.exec(value);
  return m ? { cor: `rgb(${m[1]},${m[2]},${m[3]})`, opacidade: m[4] === undefined ? 1 : Number(m[4]) } : { cor: value, opacidade: 1 };
}

export function Backdrop() {
  const { scene } = useTheme();
  const { width, height } = useWindowDimensions();
  const id = useId().replace(/:/g, '');
  const a = rgba(scene.glowA);
  const b = rgba(scene.glowB);
  return (
    <View pointerEvents="none" style={StyleSheet.absoluteFill}>
      {/* Explicit numeric size: percentage props stop react-native-svg painting on web. */}
      <Svg width={width} height={height} viewBox="0 0 1 1" preserveAspectRatio="none" style={StyleSheet.absoluteFill}>
        <Defs>
          <LinearGradient id={`base${id}`} x1="0" y1="0" x2="1" y2="1">
            <Stop offset="0" stopColor={scene.backdropFrom} />
            <Stop offset="1" stopColor={scene.backdropTo} />
          </LinearGradient>
          <RadialGradient id={`a${id}`} cx="0.9" cy="0.1" r="0.65">
            <Stop offset="0" stopColor={a.cor} stopOpacity={a.opacidade} />
            <Stop offset="1" stopColor={a.cor} stopOpacity={0} />
          </RadialGradient>
          <RadialGradient id={`b${id}`} cx="0.1" cy="0.9" r="0.55">
            <Stop offset="0" stopColor={b.cor} stopOpacity={b.opacidade} />
            <Stop offset="1" stopColor={b.cor} stopOpacity={0} />
          </RadialGradient>
        </Defs>
        <Rect x="0" y="0" width="1" height="1" fill={`url(#base${id})`} />
        <Rect x="0" y="0" width="1" height="1" fill={`url(#b${id})`} />
        <Rect x="0" y="0" width="1" height="1" fill={`url(#a${id})`} />
      </Svg>
    </View>
  );
}

/** Screen shell used as each stack's `screenLayout`: entrance driven by focus (mount runs too early on native). */
export function Tela({ children }: { children: ReactNode }) {
  const [entrada] = useState(() => new Animated.Value(0));
  useFocusEffect(
    useCallback(() => {
      entrada.setValue(0);
      const animacao = Animated.timing(entrada, {
        toValue: 1, duration: 220, easing: Easing.out(Easing.cubic), useNativeDriver: true,
      });
      animacao.start();
      return () => animacao.stop();
    }, [entrada]),
  );
  const translateY = entrada.interpolate({ inputRange: [0, 1], outputRange: [10, 0] });
  return <Animated.View style={{ flex: 1, opacity: entrada, transform: [{ translateY }] }}>{children}</Animated.View>;
}
