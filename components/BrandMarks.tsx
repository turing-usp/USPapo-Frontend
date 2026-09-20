/**
 * Shared SVG brand marks, ported from the old site (uspapo/site):
 *
 * - TuringMark: the wordmark from site/app/turing-logo.svg (brand orange)
 * - GoogleG: the 4-color Google "G" from the old login screen
 * - EnvelopeIcon / LockIcon: the old login field adornments (stroked)
 * - EyeIcon / EyeOffIcon: the old login password show/hide toggles (stroked)
 *
 * `size` is the rendered width in pt. Square marks (24x24 viewBox) use it as
 * the height too; TuringMark is a wide wordmark, so its height follows the
 * original 142.53:36.14 aspect.
 */
import React from 'react';
import { Path, Svg } from 'react-native-svg';

/** Brand orange (uspapo/site globals: `--brand`); never changes with scheme. */
const BRAND = '#f1863d';
/** Muted gray-blue for field adornments (light `muted-foreground`). */
const MUTED = '#55618a';

/** The USPapo mark (site/public/logo.svg): the maze "T" on a 32.89 grid. */
const LOGO_PATH =
  'M22.84,8.22V13.7H19.18v3.66H17.36V11.88H21V10.05H11.88v1.83h3.65V21H7.82A1.42,1.42,0,0,1,6.4,19.59v-15H25.07A1.43,1.43,0,0,1,26.49,6v13.6A1.43,1.43,0,0,1,25.07,21H19.18v1.83h7.31v5.48H24.66V24.66H18.78a1.42,1.42,0,0,1-1.42-1.42V19.18h7.3V6.4H8.22V19.18H13.7V13.7H10.05v-4a1.43,1.43,0,0,1,1.43-1.43Z';

/**
 * The USPapo mark (site/public/uspapo.svg): an open book/screen drawn as a
 * single stroked path. This is the app's own logo — distinct from LogoMark
 * below, which is Turing's maze "T" and only appears in the "Desenvolvido
 * por" footer.
 */
export function LogoUSPapo({ size = 40 }: { size?: number }) {
  return (
    <Svg
      width={size}
      height={size}
      viewBox="131.297 24.502 249.939 453.875"
    >
      <Path
        fill="none"
        stroke="#ff914c"
        strokeWidth={25}
        d="m 228.1516,306.48441 h -39.14196 m 39.1358,-77.8353 h -39.1358 m 39.12939,-77.92258 H 189.00964 M 227.99942,94.767333 143.79671,46.152882 V 374.86912 l 141.78215,81.85796 V 404.10032 M 228.13173,55.371627 368.70639,137.28661 367.44383,451.80426 228.15668,370.63953 Z"
      />
    </Svg>
  );
}

/** Turing's maze mark, brand orange. Square; `size` is width and height. */
export function LogoMark({ size = 32 }: { size?: number }) {
  return (
    <Svg width={size} height={size} viewBox="0 0 32.89 32.89">
      <Path d={LOGO_PATH} fill={BRAND} />
    </Svg>
  );
}

/** Turing wordmark paths (site/app/turing-logo.svg), in draw order. */
const TURING_PATHS: string[] = [
  'M26.32,9.85v5.48H22.66V19H20.84V13.5h3.65V11.67H15.36V13.5H19v9.14H11.3a1.42,1.42,0,0,1-1.42-1.43v-15H28.55A1.43,1.43,0,0,1,30,7.62V21.21a1.43,1.43,0,0,1-1.42,1.43H22.66v1.82H30v5.48H28.14V26.29H22.26a1.42,1.42,0,0,1-1.42-1.43V20.81h7.3V8H11.7V20.81h5.48V15.33H13.53V11.27A1.43,1.43,0,0,1,15,9.85Z',
  'M39.92,22.64a2.25,2.25,0,0,1-2.25-2.25V9.88h2v3h3.89v2H39.66V20a.83.83,0,0,0,.1.51.86.86,0,0,0,.51.09h3.28v2Z',
  'M47.58,22.64a2.27,2.27,0,0,1-2.25-2.25V12.91h2V20a.86.86,0,0,0,.09.51.86.86,0,0,0,.51.09h4.68a.86.86,0,0,0,.51-.09.86.86,0,0,0,.09-.51V12.91h2v7.48A2.27,2.27,0,0,1,53,22.64Z',
  'M57.39,22.64V15.16a2.25,2.25,0,0,1,2.24-2.25h5.42v2H60a.92.92,0,0,0-.52.09.86.86,0,0,0-.09.51v7.13Z',
  'M66.69,11.74v-2h2v2Zm0,10.9V12.91h2v9.73Z',
  'M71.05,22.64V12.91H78.7a2.12,2.12,0,0,1,1.57.66,2.17,2.17,0,0,1,.66,1.59v7.48h-2V15.51a.86.86,0,0,0-.09-.51.86.86,0,0,0-.51-.09H73.67a.9.9,0,0,0-.52.09c-.07.06-.1.23-.1.51v7.13Z',
  'M84.5,26.48v-2h5.62a.86.86,0,0,0,.51-.09.86.86,0,0,0,.09-.51V22.64H85.09a2.27,2.27,0,0,1-2.25-2.25V15.16a2.25,2.25,0,0,1,2.25-2.25h5.39a2.14,2.14,0,0,1,1.59.66,2.19,2.19,0,0,1,.64,1.59v9.07a2.17,2.17,0,0,1-.64,1.59,2.14,2.14,0,0,1-1.59.66Zm.94-5.84h4.68a.86.86,0,0,0,.51-.09.86.86,0,0,0,.09-.51V15.51a.86.86,0,0,0-.09-.51.86.86,0,0,0-.51-.09H85.44a.86.86,0,0,0-.51.09.83.83,0,0,0-.1.51V20a.83.83,0,0,0,.1.51A.86.86,0,0,0,85.44,20.64Z',
  'M94.93,22.64v-2h2v2Z',
  'M101.33,22.64A2.18,2.18,0,0,1,99.74,22a2.15,2.15,0,0,1-.65-1.58V12.91h2V20a.86.86,0,0,0,.09.51.92.92,0,0,0,.52.09h4.67a.86.86,0,0,0,.51-.09c.07-.06.1-.23.1-.51V12.91h2v7.48a2.25,2.25,0,0,1-2.24,2.25Z',
  'M113,22.64a2.27,2.27,0,0,1-2.24-2.25v-.32h2v.12a.36.36,0,0,0,.45.45h5a.52.52,0,0,0,.36-.09.47.47,0,0,0,.1-.36v-1a.47.47,0,0,0-.1-.36.52.52,0,0,0-.36-.09H113a2.25,2.25,0,0,1-2.24-2.25V15.16A2.25,2.25,0,0,1,113,12.91h5.38a2.21,2.21,0,0,1,1.61.66,2.17,2.17,0,0,1,.66,1.59v.32h-2v-.12a.47.47,0,0,0-.1-.36.52.52,0,0,0-.36-.09h-5a.36.36,0,0,0-.45.45v.95a.52.52,0,0,0,.09.36.47.47,0,0,0,.36.1h5.18a2.21,2.21,0,0,1,1.61.66,2.16,2.16,0,0,1,.66,1.58v1.38A2.16,2.16,0,0,1,120,22a2.22,2.22,0,0,1-1.61.67Z',
  'M122.78,26.49V12.91h7.64a2.24,2.24,0,0,1,2.23,2.25v5.23a2.25,2.25,0,0,1-2.23,2.25h-5.65v3.85Zm2.61-5.85h4.66a.92.92,0,0,0,.52-.09.86.86,0,0,0,.09-.51V15.51a.86.86,0,0,0-.09-.51.92.92,0,0,0-.52-.09h-4.66a.92.92,0,0,0-.52.09.83.83,0,0,0-.1.51V20a.83.83,0,0,0,.1.51A.92.92,0,0,0,125.39,20.64Z',
];

/** Turing wordmark (uspapo/site/app/turing-logo.svg). */
export function TuringMark({ size = 56 }: { size?: number }) {
  return (
    <Svg width={size} height={size * (36.14 / 142.53)} viewBox="0 0 142.53 36.14">
      {TURING_PATHS.map((d) => (
        <Path key={d} d={d} fill={BRAND} />
      ))}
    </Svg>
  );
}

/** 4-color Google "G" (old login screen, exact path data and colors). */
const GOOGLE_PATHS: { d: string; fill: string }[] = [
  {
    fill: '#4285F4',
    d: 'M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z',
  },
  {
    fill: '#34A853',
    d: 'M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z',
  },
  {
    fill: '#FBBC05',
    d: 'M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.06H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.94l2.85-2.22.81-.63z',
  },
  {
    fill: '#EA4335',
    d: 'M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.06l3.66 2.84c.87-2.6 3.3-4.52 6.16-4.52z',
  },
];

export function GoogleG({ size = 18 }: { size?: number }) {
  return (
    <Svg width={size} height={size} viewBox="0 0 24 24">
      {GOOGLE_PATHS.map((p) => (
        <Path key={p.fill} d={p.d} fill={p.fill} />
      ))}
    </Svg>
  );
}

type IconeProps = { size?: number; color?: string };

/**
 * Stroked 24x24 icon, same line style as the old site's inline SVGs
 * (fill: none, stroke 1.8, round caps/joins).
 */
function IconeTracado({
  size = 20,
  color = MUTED,
  d,
}: IconeProps & { d: string | string[] }) {
  return (
    <Svg width={size} height={size} viewBox="0 0 24 24">
      {(Array.isArray(d) ? d : [d]).map((path) => (
        <Path
          key={path}
          d={path}
          fill="none"
          stroke={color}
          strokeWidth={1.8}
          strokeLinecap="round"
          strokeLinejoin="round"
        />
      ))}
    </Svg>
  );
}

/** Envelope (old login email field adornment). */
export function EnvelopeIcon(props: IconeProps) {
  return (
    <IconeTracado
      d="M3 8l7.89 5.26a2 2 0 002.22 0L21 8M5 19h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v10a2 2 0 002 2z"
      {...props}
    />
  );
}

/** Person (register "Nome" field adornment). */
export function UserIcon(props: IconeProps) {
  return (
    <IconeTracado
      d="M15.75 6a3.75 3.75 0 11-7.5 0 3.75 3.75 0 017.5 0zM4.5 20.25a7.5 7.5 0 1115 0v.75H4.5v-.75z"
      {...props}
    />
  );
}

/** Padlock (old login password field adornment). */
export function LockIcon(props: IconeProps) {
  return (
    <IconeTracado
      d="M12 15v2m-6 4h12a2 2 0 002-2v-6a2 2 0 00-2-2H6a2 2 0 00-2 2v6a2 2 0 002 2zm10-10V7a4 4 0 00-8 0v4h8z"
      {...props}
    />
  );
}

/** Open eye (old login "show password" state). */
export function EyeIcon(props: IconeProps) {
  return (
    <IconeTracado
      d={[
        'M15 12a3 3 0 11-6 0 3 3 0 016 0z',
        'M2.458 12C3.732 7.943 7.523 5 12 5c4.478 0 8.268 2.943 9.542 7-1.274 4.057-5.064 7-9.542 7-4.477 0-8.268-2.943-9.542-7z',
      ]}
      {...props}
    />
  );
}

/** Eye with slash (old login "password visible" state). */
export function EyeOffIcon(props: IconeProps) {
  return (
    <IconeTracado
      d="M13.875 18.825A10.05 10.05 0 0112 19c-4.478 0-8.268-2.943-9.543-7a9.97 9.97 0 011.563-3.029m5.858-5.908A8.962 8.962 0 0112 5c4.478 0 8.268 2.943 9.542 7a10.025 10.025 0 01-4.132 5.411m0 0L21 21M3 3l18 18"
      {...props}
    />
  );
}
