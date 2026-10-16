/**
 * Design tokens and the theme provider, after the Turing visual identity manual (2021).
 *
 * Every color is a color of the manual's palette, or one of them at a lower opacity (`alfa`): each
 * scheme only picks which palette color plays each role. Type follows the manual too (`fonts`).
 * The scheme preference (light | dark | oled | system) is persisted in AsyncStorage.
 */
import AsyncStorage from '@react-native-async-storage/async-storage';
import React, { createContext, useContext, useEffect, useMemo, useState, type ReactNode } from 'react';
import { Appearance, Platform, type ViewStyle } from 'react-native';

import { PRETO, alfa, paleta } from './paleta';

export { alfa, paleta } from './paleta';

/** `oled` is the true-black dark scheme: everything dark-only also applies to it (see `Theme.escuro`). */
export type Scheme = 'light' | 'dark' | 'oled';
export type ThemePreference = Scheme | 'system';
export const THEME_STORAGE_KEY = 'theme:scheme';

/**
 * The roles. Orange is the brand fill (buttons, the mark, edges); on it, text and icons are graphite
 * (5.7:1, where white is 2.6:1). Orange text on a light canvas is 2.2:1, so text and meaningful
 * graphics that need color take `accent`: blue on light (5.6:1), orange on dark (5.7:1). Secondary
 * text is the text color at 72%: AA (4.5:1) even on glass over busy content.
 */
function cores(canvas: string, foreground: string, accent: string, scrim: string) {
  return {
    brand: paleta.laranja as string,
    brandForeground: paleta.grafite as string,
    accent,
    canvas,
    foreground,
    mutedForeground: alfa(foreground, 0.72),
    /** Dims the screen behind the drawer and pop-ups. */
    scrim,
  };
}

const palette = {
  light: cores(paleta.claro, paleta.grafite, paleta.azul, paleta.grafite),
  dark: cores(paleta.grafite, paleta.branco, paleta.laranja, PRETO),
  oled: cores(PRETO, paleta.branco, paleta.laranja, PRETO),
};
export type SchemeColors = (typeof palette)['light'];

type TokensDeVidro = {
  tint: { surface: string; vidro: string };
  hairline: ViewStyle;
  shadow: { shadowColor: string; shadowOffset: { width: number; height: number }; shadowOpacity: number; shadowRadius: number };
};

const borda = (topo: string, lados: string): ViewStyle => ({
  borderWidth: 1, borderTopColor: topo, borderRightColor: lados, borderBottomColor: lados, borderLeftColor: lados,
});
const sombra = (shadowColor: string, shadowOpacity: number) => ({ shadowColor, shadowOffset: { width: 0, height: 6 }, shadowOpacity, shadowRadius: 10 });

/**
 * Glass: a translucent tint per variant, a bright top filament, and a soft lift. Flat panes use
 * `surface`; every blurred pane uses `vidro`, so they all match. The tint is white on light and
 * the palette's gray on dark (it lifts the pane off the graphite or black canvas); `vidro` is a
 * touch denser, for WCAG AA over whatever scrolls behind (text at 8:1 or more over blurred text).
 */
export const glass: Record<Scheme, TokensDeVidro> = {
  light: {
    tint: { surface: alfa(paleta.branco, 0.55), vidro: alfa(paleta.branco, 0.6) },
    hairline: borda(alfa(paleta.branco, 0.95), alfa(paleta.grafite, 0.12)),
    shadow: sombra(paleta.grafite, 0.18),
  },
  dark: {
    tint: { surface: alfa(paleta.cinza, 0.4), vidro: alfa(paleta.cinza, 0.5) },
    hairline: borda(alfa(paleta.branco, 0.3), alfa(paleta.branco, 0.07)),
    shadow: sombra(PRETO, 0.5),
  },
  // The top filament glows like an ember over black.
  oled: {
    tint: { surface: alfa(paleta.cinza, 0.25), vidro: alfa(paleta.cinza, 0.3) },
    hairline: borda(alfa(paleta.laranja, 0.34), alfa(paleta.branco, 0.08)),
    shadow: sombra(PRETO, 0.6),
  },
};
export type GlassTokens = Omit<TokensDeVidro, 'shadow'> & { shadow: ViewStyle };
export type GlassVariant = keyof GlassTokens['tint'];

export const spacing = { xs: 4, sm: 8, md: 12, lg: 16, xl: 20, '2xl': 24, '3xl': 32 } as const;
export const radius = { sm: 8, md: 12, lg: 16, xl: 24, full: 9999 } as const;
/**
 * The manual's type (Orbitron only lives inside the Turing logotype, drawn as SVG). Changa never sets
 * body text, and M PLUS 1p and Roboto Mono never set titles. React Native selects bold by family
 * name, so the bold face is a family of its own. Changa's tall Arabic metrics need an explicit
 * lineHeight wherever it is used (every `typography` step has one).
 */
export const fonts = {
  /** Changa Medium: titles, buttons and navigation. */
  title: 'Changa-Medium',
  /** M PLUS 1p: body text. */
  body: 'MPLUS1p-Regular',
  bodyBold: 'MPLUS1p-Bold',
  /** Roboto Mono: code and details (addresses, versions, tags). */
  mono: 'RobotoMono-Regular',
} as const;
export const typography = {
  xs: { fontSize: 12, lineHeight: 17 },
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
function comSombra(tokens: TokensDeVidro): GlassTokens {
  if (Platform.OS !== 'android') return tokens;
  const { shadowColor, shadowOffset, shadowOpacity, shadowRadius } = tokens.shadow;
  return { ...tokens, shadow: { boxShadow: `${shadowOffset.width}px ${shadowOffset.height}px ${shadowRadius}px ${alfa(shadowColor, shadowOpacity)}` } };
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
    return { scheme: s, escuro: s !== 'light', colors: palette[s], glass: comSombra(glass[s]), spacing, radius, typography, fonts, layout };
  }, [preference, system]);

  return <ThemeContext.Provider value={theme}>{children}</ThemeContext.Provider>;
}

export function useTheme(): Theme {
  const theme = useContext(ThemeContext);
  if (!theme) throw new Error('useTheme deve ser usado dentro de <ThemeProvider>.');
  return theme;
}
