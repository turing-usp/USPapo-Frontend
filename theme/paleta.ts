/**
 * The Turing visual identity manual's palette (2021) and its one allowed variation: a lower opacity.
 * No React Native here, so `lib/` can use it too.
 */

/** The primary orange and blue, then the support colors. */
export const paleta = {
  laranja: '#f1863d',
  azul: '#0660a2',
  amarelo: '#ffbf00',
  azulEscuro: '#2b4e72',
  claro: '#ededf5',
  grafite: '#272830',
  cinza: '#494c56',
  cinzaClaro: '#6d737c',
  branco: '#ffffff',
} as const;

/** True black, outside the palette: the OLED canvas (pixels off) and the shadows on dark schemes. */
export const PRETO = '#000000';

/** A palette color (#rrggbb) at a lower opacity: the only variation of a color the app makes. */
export function alfa(cor: string, opacidade: number): string {
  const n = parseInt(cor.slice(1), 16);
  return `rgba(${n >> 16},${(n >> 8) & 255},${n & 255},${opacidade})`;
}
