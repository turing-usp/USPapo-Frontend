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
import { Appearance, type ViewStyle } from 'react-native';
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
 * The glass "blade" as plain React Native style objects (viewBox-safe: only
 * properties that React Native — and victory-native chart views — understand;
 * no backdrop-filter, no CSS-only keywords).
 *
 * - surface: the main translucent panel (chat bubbles, cards)
 * - raised:  a more opaque glass for floating menus / toasts
 * - brand:   the composer variant (hairline in the brand orange)
 * - hairline: the 1px edge filament
 * - shadow:  the short, diffuse lift (spread the object last)
 */
export type GlassStyles = {
  surface: ViewStyle;
  raised: ViewStyle;
  brand: ViewStyle;
  hairline: ViewStyle;
  shadow: ViewStyle;
};

export const glass: Record<Scheme, GlassStyles> = {
  light: {
    surface: {
      backgroundColor: 'rgba(255,255,255,0.55)',
    },
    raised: {
      backgroundColor: 'rgba(255,255,255,0.72)',
    },
    brand: {
      backgroundColor: 'rgba(255,255,255,0.40)',
      borderColor: 'rgba(241,134,61,0.65)',
      borderWidth: 1.5,
    },
    hairline: {
      borderColor: 'rgba(255,255,255,0.65)',
      borderWidth: 1,
    },
    // Old value: 0 6px 20px -3px rgb(11 16 48 / 0.20). RN has no negative
    // spread, so the -3px is dropped and the blur mapped to shadowRadius.
    shadow: {
      shadowColor: 'rgb(11,16,48)',
      shadowOffset: { width: 0, height: 6 },
      shadowOpacity: 0.2,
      shadowRadius: 10,
      elevation: 6,
    },
  },
  dark: {
    surface: {
      backgroundColor: 'rgba(9,11,44,0.6)',
    },
    raised: {
      backgroundColor: 'rgba(10,13,60,0.8)',
    },
    brand: {
      backgroundColor: 'rgba(9,11,44,0.45)',
      borderColor: 'rgba(241,134,61,0.8)',
      borderWidth: 1.5,
    },
    hairline: {
      borderColor: 'rgba(255,255,255,0.12)',
      borderWidth: 1,
    },
    // Old value: 0 6px 20px -3px rgb(0 0 0 / 0.58).
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
  spacing: typeof spacing;
  radius: typeof radius;
  typography: typeof typography;
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
    spacing,
    radius,
    typography,
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
