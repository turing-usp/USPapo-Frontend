/**
 * A widget as an image (Android and iOS; the web has lib/imagem.web.ts): its view captured as a PNG
 * at the screen's density (react-native-view-shot), renamed to `nome`.png (the name the gallery and
 * the share targets show), then added to the gallery (expo-media-library) or handed to the share
 * sheet (expo-sharing).
 *
 * Saving asks only to add photos (iOS), never to read them; Android 10+ needs no permission at all.
 * Android 9 and older want WRITE_EXTERNAL_STORAGE, which the app does not declare: there the share
 * sheet takes over (a gallery or Files app saves it).
 */
import { File, Paths } from 'expo-file-system';
import { Asset, requestPermissionsAsync } from 'expo-media-library';
import * as Sharing from 'expo-sharing';
import type { RefObject } from 'react';
import { Platform, type View } from 'react-native';
import { captureRef } from 'react-native-view-shot';

export type ResultadoDaImagem = 'salva' | 'compartilhada' | 'cancelada' | 'negada' | 'falhou';

/** Android and iOS always have a share sheet for files. */
export const PODE_COMPARTILHAR_IMAGEM = true;

/** The capture under its own name (view-shot adds random digits to it). */
async function capturar(vista: RefObject<View | null>, nome: string): Promise<File> {
  const captura = new File(await captureRef(vista, { format: 'png', result: 'tmpfile' }));
  const arquivo = new File(Paths.cache, `${nome}.png`);
  await captura.move(arquivo, { overwrite: true });
  return arquivo;
}

function descartar(arquivo: File | null): void {
  try {
    if (arquivo?.exists) arquivo.delete();
  } catch {
    // The cache directory is the system's to clean anyway.
  }
}

export async function compartilharImagem(vista: RefObject<View | null>, nome: string): Promise<ResultadoDaImagem> {
  let arquivo: File | null = null;
  try {
    arquivo = await capturar(vista, nome);
    await Sharing.shareAsync(arquivo.uri, { mimeType: 'image/png', UTI: 'public.png', dialogTitle: 'Compartilhar imagem' });
    return 'compartilhada';
  } catch {
    return 'falhou';
  } finally {
    descartar(arquivo);
  }
}

export async function salvarImagem(vista: RefObject<View | null>, nome: string): Promise<ResultadoDaImagem> {
  if (Platform.OS === 'ios') {
    const { granted } = await requestPermissionsAsync(true).catch(() => ({ granted: false }));
    if (!granted) return 'negada';
  }
  let arquivo: File | null = null;
  try {
    arquivo = await capturar(vista, nome);
    await Asset.create(arquivo.uri);
    return 'salva';
  } catch {
    if (Platform.OS !== 'android' || !arquivo) return 'falhou';
    descartar(arquivo);
    arquivo = null;
    return compartilharImagem(vista, nome);
  } finally {
    descartar(arquivo);
  }
}
