/**
 * Design tokens (ported from the old site's globals.css) and the theme provider.
 * The scheme preference (light | dark | system) is persisted in AsyncStorage.
 */
import AsyncStorage from '@react-native-async-storage/async-storage';
import React, { createContext, useContext, useEffect, useMemo, useState, type ReactNode } from 'react';
import { Appearance } from 'react-native';

export type Scheme = 'light' | 'dark';
export type ThemePreference = Scheme | 'system';
export const THEME_STORAGE_KEY = 'theme:scheme';

const palette = {
  light: {
    brand: '#f1863d',
    brandForeground: '#ffffff',
    canvas: '#dde4f6',
    surface: '#ccd6ef',
    surfaceRaised: '#ffffff',
    foreground: '#0b1030',
    mutedForeground: '#55618a',
    faintForeground: '#8790ad',
    line: '#0b1030',
    tint: '#0b1030',
    scrim: '#0b1030',
    danger: '#c53434',
    success: '#1baf7a',
    // Colorblind-safe chart slots (fixed order; color identifies the series).
    chart: ['#eb6834', '#2a78d6', '#1baf7a', '#4a3aa7', '#eda100', '#e87ba4'],
  },
  dark: {
    brand: '#f1863d',
    brandForeground: '#ffffff',
    canvas: '#03042c',
    surface: '#050738',
    surfaceRaised: '#0a0d3c',
    foreground: '#ffffff',
    mutedForeground: '#aeb8cf',
    faintForeground: '#7b86a3',
    line: '#ffffff',
    tint: '#ffffff',
    scrim: '#000000',
    danger: '#f87171',
    success: '#34d399',
    chart: ['#d95926', '#3987e5', '#199e70', '#9085e9', '#c98500', '#d55181'],
  },
};
export type SchemeColors = (typeof palette)['light'];

/** Backdrop: a 135deg base gradient with two soft radial glows (orange in light, blue in dark). */
export const scene = {
  light: { backdropFrom: '#d3dcf2', backdropTo: '#eaeefb', glowA: 'rgba(241,134,61,0.20)', glowB: 'rgba(241,134,61,0.15)' },
  dark: { backdropFrom: '#050833', backdropTo: '#010214', glowA: 'rgba(29,44,135,0.85)', glowB: 'rgba(20,31,98,0.70)' },
};
export type SceneColors = (typeof scene)['light'];

/** Glass: translucent tint per variant, a bright top filament, and a soft lift. */
export const glass = {
  light: {
    tint: { surface: 'rgba(238,239,255,0.42)', panel: 'rgba(255,255,255,0.55)', raised: 'rgba(255,255,255,0.85)', brand: 'rgba(238,239,255,0.35)' },
    hairline: {
      borderWidth: 1,
      borderTopColor: 'rgba(255,255,255,0.95)',
      borderRightColor: 'rgba(11,16,48,0.14)',
      borderBottomColor: 'rgba(11,16,48,0.14)',
      borderLeftColor: 'rgba(11,16,48,0.14)',
    },
    shadow: { shadowColor: 'rgb(11,16,48)', shadowOffset: { width: 0, height: 6 }, shadowOpacity: 0.2, shadowRadius: 10 },
  },
  dark: {
    tint: { surface: 'rgba(13,25,131,0.38)', panel: 'rgba(8,17,101,0.55)', raised: 'rgba(10,13,60,0.92)', brand: 'rgba(13,25,131,0.30)' },
    hairline: {
      borderWidth: 1,
      borderTopColor: 'rgba(255,255,255,0.38)',
      borderRightColor: 'rgba(255,255,255,0.07)',
      borderBottomColor: 'rgba(255,255,255,0.07)',
      borderLeftColor: 'rgba(255,255,255,0.07)',
    },
    shadow: { shadowColor: 'rgb(0,0,0)', shadowOffset: { width: 0, height: 6 }, shadowOpacity: 0.58, shadowRadius: 10 },
  },
};
export type GlassTokens = (typeof glass)['light'];
export type GlassVariant = keyof GlassTokens['tint'];

export const spacing = { xs: 4, sm: 8, md: 12, lg: 16, xl: 20, '2xl': 24, '3xl': 32 } as const;
export const radius = { sm: 8, md: 12, lg: 16, xl: 24, full: 9999 } as const;
/** React Native selects bold by family name, so bold faces are separate families. */
export const fonts = {
  body: 'Roboto',
  bodyBold: 'Roboto-Bold',
  display: 'Geom',
  displayBold: 'Geom-Bold',
  accent: 'Orbitron',
} as const;
export const typography = {
  xs: { fontSize: 11, lineHeight: 15 },
  sm: { fontSize: 14, lineHeight: 20 },
  base: { fontSize: 16, lineHeight: 24 },
  lg: { fontSize: 18, lineHeight: 26 },
  xl: { fontSize: 20, lineHeight: 28 },
  '2xl': { fontSize: 24, lineHeight: 32 },
  '3xl': { fontSize: 30, lineHeight: 38 },
} as const;
/** The old `.app-container` (64rem) / chat (48rem) measures with a clamp(1rem, 10vw, 4rem) gutter. */
export const layout = {
  containerMaxWidth: 1024,
  chatMaxWidth: 768,
  gutter: (width: number) => Math.max(16, Math.min(64, width * 0.1)),
} as const;

export type Theme = {
  scheme: Scheme;
  colors: SchemeColors;
  scene: SceneColors;
  glass: GlassTokens;
  spacing: typeof spacing;
  radius: typeof radius;
  typography: typeof typography;
  fonts: typeof fonts;
  layout: typeof layout;
};

const ThemeContext = createContext<Theme | null>(null);
const listeners = new Set<(p: ThemePreference) => void>();
const isPreference = (v: unknown): v is ThemePreference => v === 'light' || v === 'dark' || v === 'system';

export async function readScheme(): Promise<ThemePreference> {
  try {
    const raw = await AsyncStorage.getItem(THEME_STORAGE_KEY);
    return isPreference(raw) ? raw : 'system';
  } catch {
    return 'system';
  }
}

export async function setScheme(preference: ThemePreference): Promise<void> {
  listeners.forEach((listener) => listener(preference));
  await AsyncStorage.setItem(THEME_STORAGE_KEY, preference).catch(() => undefined);
}

export function ThemeProvider({ children }: { children: ReactNode }) {
  const [preference, setPreference] = useState<ThemePreference>('system');
  const [system, setSystem] = useState<Scheme>(Appearance.getColorScheme() === 'dark' ? 'dark' : 'light');

  useEffect(() => {
    void readScheme().then(setPreference);
    listeners.add(setPreference);
    const sub = Appearance.addChangeListener(({ colorScheme }) => setSystem(colorScheme === 'dark' ? 'dark' : 'light'));
    return () => {
      listeners.delete(setPreference);
      sub.remove();
    };
  }, []);

  const theme = useMemo<Theme>(() => {
    const s = preference === 'system' ? system : preference;
    return { scheme: s, colors: palette[s], scene: scene[s], glass: glass[s], spacing, radius, typography, fonts, layout };
  }, [preference, system]);

  return <ThemeContext.Provider value={theme}>{children}</ThemeContext.Provider>;
}

export function useTheme(): Theme {
  const theme = useContext(ThemeContext);
  if (!theme) throw new Error('useTheme deve ser usado dentro de <ThemeProvider>.');
  return theme;
}
