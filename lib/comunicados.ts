/**
 * Announcements authored outside the app (Supabase Dashboard: table `comunicados`, images in the
 * public bucket `comunicados`; see the backend migration and docs/fluxos.md). A "novidade" opens
 * once per device in a giant glass; an "aviso" is a pill that opens the same glass until it ends
 * or is hidden. RLS only returns what is active now, so withdrawing one (`ativo = false`, or
 * USPapo-Backend/scripts/comunicados.py retirar) removes it on the next read; seen/hidden ids are
 * kept on this device.
 */
import AsyncStorage from '@react-native-async-storage/async-storage';
import { Platform } from 'react-native';

import { supabase } from './supabase';

declare const process: { env: Record<string, string | undefined> };

export type Comunicado = {
  id: string;
  tipo: 'novidade' | 'aviso';
  titulo: string;
  texto: string;
  imagens: string[];
  pilula: string | null;
};

const VISTOS = 'comunicados:vistos';
const MAX_VISTOS = 100;

/** The announcements in force; null when they could not be read (keep what is on screen). */
export async function lerComunicados(): Promise<Comunicado[] | null> {
  const { data, error } = await supabase.from('comunicados')
    .select('id,tipo,titulo,texto,imagens,pilula,plataformas').order('inicio', { ascending: false }).limit(20);
  if (error) return null; // offline, or production before the migration
  return ((data ?? []) as (Comunicado & { plataformas: string[] | null })[])
    .filter((c) => !c.plataformas || c.plataformas.includes(Platform.OS))
    .map(({ plataformas: _plataformas, ...c }) => ({ ...c, imagens: c.imagens ?? [], texto: c.texto ?? '' }));
}

/** Ids already shown (novidades) or hidden (avisos) on this device. */
export async function lerVistos(): Promise<string[]> {
  try {
    const lista = JSON.parse((await AsyncStorage.getItem(VISTOS)) ?? '[]');
    return Array.isArray(lista) ? lista.map(String) : [];
  } catch {
    return [];
  }
}

export async function marcarVisto(id: string): Promise<void> {
  const lista = [id, ...(await lerVistos()).filter((v) => v !== id)].slice(0, MAX_VISTOS);
  await AsyncStorage.setItem(VISTOS, JSON.stringify(lista)).catch(() => undefined);
}

/** The newest unseen novidade and the newest aviso not hidden (the list comes newest first). */
export function escolher(lista: Comunicado[], vistos: string[]): { novidade: Comunicado | null; aviso: Comunicado | null } {
  const novo = (c: Comunicado) => !vistos.includes(c.id);
  return {
    novidade: lista.find((c) => c.tipo === 'novidade' && novo(c)) ?? null,
    aviso: lista.find((c) => c.tipo === 'aviso' && !!c.pilula && novo(c)) ?? null,
  };
}

/** A path inside the `comunicados` bucket, or a full URL as is. */
export function urlDaImagem(caminho: string): string {
  if (/^https?:\/\//i.test(caminho)) return caminho;
  const base = (process.env.EXPO_PUBLIC_SUPABASE_URL ?? '').replace(/\/+$/, '');
  return `${base}/storage/v1/object/public/comunicados/${caminho.replace(/^\/+/, '').split('/').map(encodeURIComponent).join('/')}`;
}
