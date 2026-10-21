/**
 * A widget as an image on the web: its element drawn to a canvas (react-native-view-shot, through
 * html2canvas), downloaded as a PNG, or shared where the browser can share files.
 */
import type { RefObject } from 'react';
import type { View } from 'react-native';
import { captureRef } from 'react-native-view-shot';

export type ResultadoDaImagem = 'salva' | 'compartilhada' | 'cancelada' | 'negada' | 'falhou';

export const PODE_COMPARTILHAR_IMAGEM = typeof navigator !== 'undefined' && typeof navigator.canShare === 'function';

const capturar = (vista: RefObject<View | null>) => captureRef(vista, { format: 'png', result: 'data-uri' });

export async function salvarImagem(vista: RefObject<View | null>, nome: string): Promise<ResultadoDaImagem> {
  try {
    const link = document.createElement('a');
    link.href = await capturar(vista);
    link.download = `${nome}.png`;
    document.body.appendChild(link);
    link.click();
    link.remove();
    return 'salva';
  } catch {
    return 'falhou';
  }
}

export async function compartilharImagem(vista: RefObject<View | null>, nome: string): Promise<ResultadoDaImagem> {
  try {
    const blob = await (await fetch(await capturar(vista))).blob();
    const arquivo = new File([blob], `${nome}.png`, { type: 'image/png' });
    if (!navigator.canShare({ files: [arquivo] })) return salvarImagem(vista, nome);
    await navigator.share({ files: [arquivo] });
    return 'compartilhada';
  } catch (erro) {
    // Closing the share sheet is not a failure.
    return erro instanceof DOMException && erro.name === 'AbortError' ? 'cancelada' : 'falhou';
  }
}
