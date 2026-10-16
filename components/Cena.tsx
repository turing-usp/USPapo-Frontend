/**
 * The canvas behind every screen (flat: the manual's light, its graphite or, in OLED, black) and
 * the screen entrance (content rises and fades in on focus; the navigator itself does not animate,
 * so the canvas never moves).
 */
import { useFocusEffect } from 'expo-router';
import React, { useCallback, useRef, useState, type ReactNode } from 'react';
import { Animated, Easing, StyleSheet, View } from 'react-native';

import { useTheme } from '../theme';

/** The flat canvas, filling its parent (on Android, the blur target with its overhang). */
export function Backdrop() {
  const { colors } = useTheme();
  return <View pointerEvents="none" style={[StyleSheet.absoluteFill, { backgroundColor: colors.canvas }]} />;
}

/**
 * Screen shell used as each stack's `screenLayout`: the entrance replays on every focus. On native,
 * a pushed screen is focused ~80 ms before its first frame, so the first entrance waits for the
 * screen's first layout; and every entrance starts a frame later, hidden, because the frames right
 * after a screen mounts or shows (its views, its blurred panes) are the long ones and would swallow
 * the 220 ms rise (the giant glass does the same).
 */
export function Tela({ children }: { children: ReactNode }) {
  const [entrada] = useState(() => new Animated.Value(0));
  const estado = useRef({ medida: false, pendente: false, quadro: 0 });
  const animar = useCallback(() => {
    entrada.setValue(0);
    cancelAnimationFrame(estado.current.quadro);
    estado.current.quadro = requestAnimationFrame(() => {
      Animated.timing(entrada, { toValue: 1, duration: 220, easing: Easing.out(Easing.cubic), useNativeDriver: true }).start();
    });
  }, [entrada]);
  useFocusEffect(
    useCallback(() => {
      if (estado.current.medida) animar();
      else estado.current.pendente = true;
      return () => {
        estado.current.pendente = false;
        cancelAnimationFrame(estado.current.quadro);
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
