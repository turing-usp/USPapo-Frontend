/**
 * Design tokens (ported from the old site's globals.css) and the theme provider.
 * The scheme preference (light | dark | oled | system) is persisted in AsyncStorage.
 */
import AsyncStorage from '@react-native-async-storage/async-storage';
import React, { createContext, useContext, useEffect, useMemo, useState, type ReactNode } from 'react';
import { Appearance, Platform, type ViewStyle } from 'react-native';

/** `oled` is the true-black dark scheme: everything dark-only also applies to it (see `Theme.escuro`). */
export type Scheme = 'light' | 'dark' | 'oled';
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
  oled: {
    brand: '#f1863d',
    brandForeground: '#ffffff',
    canvas: '#000000',
    surface: '#141414',
    surfaceRaised: '#0d0d0d',
    foreground: '#f0f0f0',
    mutedForeground: '#a3a3a3',
    faintForeground: '#7a7a7a',
    line: '#ffffff',
    tint: '#ffffff',
    scrim: '#000000',
    danger: '#f87171',
    success: '#34d399',
    chart: ['#d95926', '#3987e5', '#199e70', '#9085e9', '#c98500', '#d55181'],
  },
};
export type SchemeColors = (typeof palette)['light'];

/**
 * Backdrop: a 135deg base gradient with two soft radial glows. Every scheme keeps the light scheme's
 * glow contrast (WCAG ratio ~1.16 / ~1.12 against the base): orange in light, blue in dark, and an
 * ember plus a faint indigo over true black in oled.
 */
export const scene = {
  light: { backdropFrom: '#d3dcf2', backdropTo: '#eaeefb', glowA: 'rgba(241,134,61,0.20)', glowB: 'rgba(241,134,61,0.15)' },
  dark: { backdropFrom: '#050833', backdropTo: '#010214', glowA: 'rgba(29,44,135,0.39)', glowB: 'rgba(20,31,98,0.48)' },
  oled: { backdropFrom: '#000000', backdropTo: '#000000', glowA: 'rgba(241,134,61,0.14)', glowB: 'rgba(88,72,210,0.19)' },
};
export type SceneColors = (typeof scene)['light'];

/**
 * Glass: translucent tint per variant, a bright top filament, and a soft lift. Flat panes use
 * `surface`; every blurred pane uses `vidro`, so they all match. `vidro` is a touch denser, and a
 * neutral shade in OLED (a white veil left bright content bright): text sits on it over whatever
 * scrolls behind, with WCAG AA at the busiest spot of each theme.
 */
export const glass = {
  light: {
    tint: { surface: 'rgba(238,239,255,0.42)', vidro: 'rgba(238,239,255,0.46)' },
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
    tint: { surface: 'rgba(13,25,131,0.38)', vidro: 'rgba(13,25,131,0.40)' },
    hairline: {
      borderWidth: 1,
      borderTopColor: 'rgba(255,255,255,0.38)',
      borderRightColor: 'rgba(255,255,255,0.07)',
      borderBottomColor: 'rgba(255,255,255,0.07)',
      borderLeftColor: 'rgba(255,255,255,0.07)',
    },
    shadow: { shadowColor: 'rgb(0,0,0)', shadowOffset: { width: 0, height: 6 }, shadowOpacity: 0.58, shadowRadius: 10 },
  },
  // Graphite glass over black; the top filament glows like an ember.
  oled: {
    tint: { surface: 'rgba(255,255,255,0.05)', vidro: 'rgba(24,24,24,0.22)' },
    hairline: {
      borderWidth: 1,
      borderTopColor: 'rgba(241,134,61,0.34)',
      borderRightColor: 'rgba(255,255,255,0.08)',
      borderBottomColor: 'rgba(255,255,255,0.08)',
      borderLeftColor: 'rgba(255,255,255,0.08)',
    },
    shadow: { shadowColor: 'rgb(0,0,0)', shadowOffset: { width: 0, height: 6 }, shadowOpacity: 0.6, shadowRadius: 10 },
  },
};
export type GlassTokens = Omit<(typeof glass)['light'], 'shadow'> & { shadow: ViewStyle };
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
  /** dark or oled. */
  escuro: boolean;
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
const isPreference = (v: unknown): v is ThemePreference => v === 'light' || v === 'dark' || v === 'oled' || v === 'system';

/**
 * The lift as the same CSS box-shadow the web draws from these tokens. Android has no shadow* props,
 * and `elevation` paints a hard box under translucent glass; boxShadow is clipped out of the pane.
 */
function comSombra(tokens: (typeof glass)['light']): GlassTokens {
  if (Platform.OS !== 'android') return tokens;
  const { shadowColor, shadowOffset, shadowOpacity, shadowRadius } = tokens.shadow;
  const cor = shadowColor.replace('rgb(', 'rgba(').replace(')', `,${shadowOpacity})`);
  return { ...tokens, shadow: { boxShadow: `${shadowOffset.width}px ${shadowOffset.height}px ${shadowRadius}px ${cor}` } };
}

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
    return { scheme: s, escuro: s !== 'light', colors: palette[s], scene: scene[s], glass: comSombra(glass[s]), spacing, radius, typography, fonts, layout };
  }, [preference, system]);

  return <ThemeContext.Provider value={theme}>{children}</ThemeContext.Provider>;
}

export function useTheme(): Theme {
  const theme = useContext(ThemeContext);
  if (!theme) throw new Error('useTheme deve ser usado dentro de <ThemeProvider>.');
  return theme;
}
