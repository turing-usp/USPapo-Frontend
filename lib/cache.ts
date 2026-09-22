/** Read-only offline cache: the last known conversations per user, in AsyncStorage. */
import AsyncStorage from '@react-native-async-storage/async-storage';

import { LIMITE_HISTORICO, type Conversa } from './conversations';

const PREFIXO = 'uspapo:conversas:';

async function ler(userId: string): Promise<Conversa[]> {
  try {
    const bruto = await AsyncStorage.getItem(PREFIXO + userId);
    const lista = bruto ? (JSON.parse(bruto) as Conversa[]) : [];
    return Array.isArray(lista) ? lista : [];
  } catch {
    return [];
  }
}

async function gravar(userId: string, conversas: Conversa[]): Promise<void> {
  const ordenadas = [...conversas].sort((a, b) => b.atualizada_em.localeCompare(a.atualizada_em));
  await AsyncStorage.setItem(PREFIXO + userId, JSON.stringify(ordenadas.slice(0, LIMITE_HISTORICO))).catch(() => undefined);
}

export const historicoEmCache = ler;
export const guardarHistorico = gravar;

export async function conversaEmCache(userId: string, id: string): Promise<Conversa | null> {
  return (await ler(userId)).find((c) => c.id === id) ?? null;
}

export async function guardarConversa(userId: string, conversa: Conversa): Promise<void> {
  await gravar(userId, [conversa, ...(await ler(userId)).filter((c) => c.id !== conversa.id)]);
}

export async function esquecerConversa(userId: string, id: string): Promise<void> {
  await gravar(userId, (await ler(userId)).filter((c) => c.id !== id));
}

/** Bytes used by every cached history on this device. */
export async function tamanhoDoCache(): Promise<number> {
  try {
    const chaves = (await AsyncStorage.getAllKeys()).filter((k) => k.startsWith(PREFIXO));
    const pares = await AsyncStorage.multiGet(chaves);
    return pares.reduce((total, [, valor]) => total + (valor?.length ?? 0), 0);
  } catch {
    return 0;
  }
}

export async function limparCache(): Promise<void> {
  const chaves = (await AsyncStorage.getAllKeys().catch(() => [] as readonly string[])).filter((k) => k.startsWith(PREFIXO));
  await AsyncStorage.multiRemove(chaves).catch(() => undefined);
}
