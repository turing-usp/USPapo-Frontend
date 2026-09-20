/**
 * Design tokens for the USPapo app, ported from the old site's globals.css
 * (uspapo/site/app/globals.css). Values are the same calibrated palette:
 * brand orange stable across schemes, light canvas / dark navy, and the
 * 6-slot colorblind-safe chart palette (two steps per hue, light and dark
 * are different steps of the same hue — not the light one brightened).
 *
 * The `glass` vocabulary is the React Native "light profile" of the old
 * frosted glass: true backdrop blur is not portable across RN platforms, so
 * the calibrated translucent surfaces (tint + hairline + soft shadow) are
 * the native target. Use the style objects by spreading them:
 *
 *   <View style={[glass.surface, glass.hairline, glass.shadow]}>…</View>
 */
import React, {
  createContext,
  useContext,
  useEffect,
  useMemo,
  useState,
  type ReactNode,
} from 'react';
import { Appearance } from 'react-native';
import AsyncStorage from '@react-native-async-storage/async-storage';

export type Scheme = 'light' | 'dark';
/** User preference persisted under the AsyncStorage key. */
export type ThemePreference = 'light' | 'dark' | 'system';

export const THEME_STORAGE_KEY = 'theme:scheme';

export type SchemeColors = {
  /** Brand orange — one of the tokens that never changes with the scheme. */
  brand: string;
  /** Brand hover / pressed. */
  brandStrong: string;
  /** Text on top of the brand orange. */
  brandForeground: string;
  /** Page background. */
  canvas: string;
  /** Side panels. */
  surface: string;
  /** Floating menus. */
  surfaceRaised: string;
  /** Primary text. */
  foreground: string;
  /** Secondary text. */
  mutedForeground: string;
  /** Tertiary text (placeholders, timestamps). */
  faintForeground: string;
  /** Border base color (components apply the opacity: /10, /15, /25). */
  line: string;
  /** Hover base color (components apply the opacity: /5, /10). */
  tint: string;
  /** Overlay base color (components apply the opacity: /30, /60). */
  scrim: string;
  /** Error / destructive. */
  danger: string;
  /**
   * 6-slot colorblind-safe chart palette for the analytics panel. Slots are
   * assigned in a fixed order and never cycled by ranking position: color
   * identifies the entity. Beyond six, the excess becomes "Outros".
   */
  chart: [string, string, string, string, string, string];
};

export const colors: { light: SchemeColors; dark: SchemeColors } = {
  light: {
    brand: '#f1863d',
    brandStrong: '#e07125',
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
    chart: ['#eb6834', '#2a78d6', '#1baf7a', '#4a3aa7', '#eda100', '#e87ba4'],
  },
  dark: {
    brand: '#f1863d',
    brandStrong: '#e07125',
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
    chart: ['#d95926', '#3987e5', '#199e70', '#9085e9', '#c98500', '#d55181'],
  },
};

/**
 * Per-scheme scene tokens, ported from the old site's `--page-backdrop`
 * (globals.css): a 135deg linear base (backdropFrom → backdropTo) with two
 * soft radial glows. Positions (consumed by components/Backdrop):
 * glowA — top-right, ~0.9 / 0.1; glowB — bottom-left, ~0.1 / 0.9.
 * Orange in light (the brand orange, and only it), blue in dark.
 */
export type SceneColors = {
  /** Base gradient start (top-left end of the 135deg line). */
  backdropFrom: string;
  /** Base gradient end (bottom-right end of the 135deg line). */
  backdropTo: string;
  /** Soft glow at the top-right (~0.9 / 0.1). */
  glowA: string;
  /** Soft glow at the bottom-left (~0.1 / 0.9). */
  glowB: string;
};

export const scene: Record<Scheme, SceneColors> = {
  light: {
    backdropFrom: '#d3dcf2',
    backdropTo: '#eaeefb',
    glowA: 'rgba(241,134,61,0.20)',
    glowB: 'rgba(241,134,61,0.15)',
  },
  dark: {
    backdropFrom: '#050833',
    backdropTo: '#010214',
    glowA: 'rgba(29,44,135,0.85)',
    glowB: 'rgba(20,31,98,0.70)',
  },
};

/** Spacing scale (pt). */
export const spacing = {
  xs: 4,
  sm: 8,
  md: 12,
  lg: 16,
  xl: 20,
  '2xl': 24,
  '3xl': 32,
} as const;

/** Corner radii (pt). */
export const radius = {
  sm: 8,
  md: 12,
  lg: 16,
  xl: 24,
  full: 9999,
} as const;

/**
 * Type families, ported from the old site. `body` is what `body { font-family }`
 * resolved to there (Roboto); `display` is `.font-geom`, used for the wordmark,
 * screen titles and the drawer's nav labels. Orbitron ships with the app but
 * the old site never rendered it — only the CSS variable was declared.
 *
 * React Native picks a face by family name, not by synthesising weight, so the
 * bold faces are separate families rather than a `fontWeight` on the regular.
 */
export const fonts = {
  body: 'Roboto',
  bodyBold: 'Roboto-Bold',
  display: 'Geom',
  displayBold: 'Geom-Bold',
  accent: 'Orbitron',
  accentBold: 'Orbitron-Bold',
} as const;

/**
 * Content measures, ported from `.app-container` / `.app-container-chat`:
 * 64rem and 48rem with `padding-inline: clamp(1rem, 10vw, 4rem)`.
 */
export const layout = {
  containerMaxWidth: 1024,
  chatMaxWidth: 768,
  gutterMin: 16,
  gutterMax: 64,
  /** The clamp(1rem, 10vw, 4rem) gutter resolved for a viewport width. */
  gutter(width: number): number {
    return Math.max(16, Math.min(64, width * 0.1));
  },
} as const;

export type TypographyStep = {
  fontSize: number;
  lineHeight: number;
};

/**
 * Type scale built around the 16pt base, with line heights (port of the old
 * fluid clamps collapsed to their mid values for the phone range).
 */
export const typography = {
  xs: { fontSize: 11, lineHeight: 15 },
  sm: { fontSize: 14, lineHeight: 20 },
  base: { fontSize: 16, lineHeight: 24 },
  lg: { fontSize: 18, lineHeight: 26 },
  xl: { fontSize: 20, lineHeight: 28 },
  '2xl': { fontSize: 24, lineHeight: 32 },
  '3xl': { fontSize: 30, lineHeight: 38 },
} as const;

/**
 * The glass "blade", rendered with the old site's own **no-blur profile**
 * (`:root[data-vidro=leve]` / `--glass-blur: 0px` in globals.css). That path
 * swaps every translucent tint for the calibrated opaque `--glass-opaco`
 * colors, so it costs one flat fill instead of a 44px backdrop-filter — the
 * reason the old site shipped it as the fast option in the first place.
 *
 * The edge is the one place a single RN border cannot match the original:
 * the old `.glass:after` paints a 165deg gradient ring from `--glass-edge-hi`
 * down to `--glass-edge-lo`. Per-side border colors reproduce the part that
 * actually reads — a bright top filament over dimmer sides.
 *
 *   surface — chat bubbles, cards, pills    (--glass-opaco)
 *   panel   — the drawer and floating menus (--glass-opaco-panel)
 *   raised  — glass stacked on glass        (--glass-opaco-empilhado)
 *   brand   — the composer                  (edge in the brand orange)
 *   hairline / shadow — spread onto any of the above
 */
export type GlassSlot = {
  backgroundColor?: string;
  borderColor?: string;
  borderTopColor?: string;
  borderRightColor?: string;
  borderBottomColor?: string;
  borderLeftColor?: string;
  borderWidth?: number;
  shadowColor?: string;
  shadowOffset?: { width: number; height: number };
  shadowOpacity?: number;
  shadowRadius?: number;
  elevation?: number;
};

export type GlassStyles = {
  surface: GlassSlot;
  panel: GlassSlot;
  raised: GlassSlot;
  brand: GlassSlot;
  hairline: GlassSlot;
  shadow: GlassSlot;
};

export const glass: Record<Scheme, GlassStyles> = {
  light: {
    surface: { backgroundColor: '#e6e1ec' },
    panel: { backgroundColor: '#e2dbeb' },
    raised: { backgroundColor: '#e8e3eb' },
    // --glass-brand: the ring becomes the brand orange on all four sides.
    brand: {
      borderColor: '#f1863d',
      borderWidth: 1.5,
    },
    // --glass-edge-hi #fffffff2 over --glass-edge-lo #0b103024.
    hairline: {
      borderTopColor: 'rgba(255,255,255,0.95)',
      borderRightColor: 'rgba(11,16,48,0.14)',
      borderBottomColor: 'rgba(11,16,48,0.14)',
      borderLeftColor: 'rgba(11,16,48,0.14)',
      borderWidth: 1,
    },
    // --glass-shadow: 0 6px 20px -3px var(--glass-shadow-color). RN has no
    // negative spread, so the -3px is dropped and 20px maps to shadowRadius.
    shadow: {
      shadowColor: 'rgb(11,16,48)',
      shadowOffset: { width: 0, height: 6 },
      shadowOpacity: 0.2,
      shadowRadius: 10,
      elevation: 6,
    },
  },
  dark: {
    surface: { backgroundColor: '#0d1983' },
    panel: { backgroundColor: '#081165' },
    raised: { backgroundColor: '#031dbb' },
    brand: {
      borderColor: '#f1863d',
      borderWidth: 1.5,
    },
    // --glass-edge-hi #ffffff61 over --glass-edge-lo #ffffff12.
    hairline: {
      borderTopColor: 'rgba(255,255,255,0.38)',
      borderRightColor: 'rgba(255,255,255,0.07)',
      borderBottomColor: 'rgba(255,255,255,0.07)',
      borderLeftColor: 'rgba(255,255,255,0.07)',
      borderWidth: 1,
    },
    shadow: {
      shadowColor: 'rgb(0,0,0)',
      shadowOffset: { width: 0, height: 6 },
      shadowOpacity: 0.58,
      shadowRadius: 10,
      elevation: 8,
    },
  },
};

/** Resolved tokens for the active scheme. */
export type Theme = {
  scheme: Scheme;
  colors: SchemeColors;
  scene: SceneColors;
  spacing: typeof spacing;
  radius: typeof radius;
  typography: typeof typography;
  fonts: typeof fonts;
  layout: typeof layout;
  glass: GlassStyles;
};

const ThemeContext = createContext<Theme | null>(null);

type PreferenceListener = (preference: ThemePreference) => void;
const preferenceListeners = new Set<PreferenceListener>();

function isPreference(value: string | null): value is ThemePreference {
  return value === 'light' || value === 'dark' || value === 'system';
}

async function readPreference(): Promise<ThemePreference> {
  try {
    const raw = await AsyncStorage.getItem(THEME_STORAGE_KEY);
    if (isPreference(raw)) return raw;
  } catch {
    // Storage unavailable (tests, first run): fall through to the default.
  }
  return 'system';
}

/**
 * Persists the scheme preference (AsyncStorage key `theme:scheme`) and
 * notifies the ThemeProvider so the UI updates immediately. Settings screens
 * call this to toggle between light / dark / system.
 */
export async function setScheme(preference: ThemePreference): Promise<void> {
  try {
    await AsyncStorage.setItem(THEME_STORAGE_KEY, preference);
  } catch {
    // In-memory-only fallback: the provider still updates via the listener.
  }
  preferenceListeners.forEach((listener) => listener(preference));
}

function resolveScheme(preference: ThemePreference, systemScheme: Scheme): Scheme {
  return preference === 'system' ? systemScheme : preference;
}

function buildTheme(scheme: Scheme): Theme {
  return {
    scheme,
    colors: colors[scheme],
    scene: scene[scheme],
    spacing,
    radius,
    typography,
    fonts,
    layout,
    glass: glass[scheme],
  };
}

/**
 * Theme provider. Resolves the effective scheme from the persisted
 * preference (default `system`, following the device via
 * react-native `Appearance`) and publishes the resolved tokens.
 */
export function ThemeProvider({ children }: { children: ReactNode }) {
  const [preference, setPreferenceState] = useState<ThemePreference>('system');
  const [systemScheme, setSystemScheme] = useState<Scheme>(() =>
    Appearance.getColorScheme() === 'dark' ? 'dark' : 'light',
  );

  useEffect(() => {
    let ativo = true;
    void readPreference().then((p) => {
      if (ativo) setPreferenceState(p);
    });
    return () => {
      ativo = false;
    };
  }, []);

  useEffect(
    () => {
      const sub = Appearance.addChangeListener((change) => {
        setSystemScheme(change.colorScheme === 'dark' ? 'dark' : 'light');
      });
      return () => {
        sub.remove();
      };
    },
    [],
  );

  useEffect(() => {
    const listener: PreferenceListener = setPreferenceState;
    preferenceListeners.add(listener);
    return () => {
      preferenceListeners.delete(listener);
    };
  }, []);

  const theme = useMemo(
    () => buildTheme(resolveScheme(preference, systemScheme)),
    [preference, systemScheme],
  );

  return <ThemeContext.Provider value={theme}>{children}</ThemeContext.Provider>;
}

/** Resolved theme for the active scheme. Must be used inside <ThemeProvider>. */
export function useTheme(): Theme {
  const theme = useContext(ThemeContext);
  if (!theme) {
    throw new Error('useTheme deve ser usado dentro de <ThemeProvider>.');
  }
  return theme;
}
