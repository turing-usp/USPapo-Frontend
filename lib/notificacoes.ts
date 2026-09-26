/**
 * "Answer ready" notifications, native: the backend pushes them through Expo when a turn finishes
 * (USPapo-Backend/app/notificacoes.py), even with the app closed. This module registers the device
 * token, creates the Android channel, hides the banner while that conversation is on screen and
 * opens the conversation when a notification is tapped. The web build uses notificacoes.web.ts.
 */
import AsyncStorage from '@react-native-async-storage/async-storage';
import Constants from 'expo-constants';
import * as Notifications from 'expo-notifications';
import { useEffect } from 'react';
import { Platform } from 'react-native';

import { supabase } from './supabase';

const ATIVAS = 'notificacoes:ativas';
const PERGUNTADO = 'notificacoes:perguntado';
const CANAL = 'respostas';

export const NOTIFICACOES_DISPONIVEIS = Platform.OS === 'android' || Platform.OS === 'ios';
export const DESCRICAO = 'Mesmo com o app fechado, você recebe um aviso quando a resposta termina.';

let emFoco: string | null = null;
let token: string | null = null;
const abertas = new Set<string>();

Notifications.setNotificationHandler({
  handleNotification: async (n) => {
    const visivel = (n.request.content.data as { conversa?: unknown } | null)?.conversa !== emFoco;
    return { shouldShowBanner: visivel, shouldShowList: visivel, shouldPlaySound: false, shouldSetBadge: false };
  },
});

/** The conversation on screen: its own "ready" banner would only repeat what the student sees. */
export function focarConversa(id: string | null): void {
  emFoco = id;
}

export async function notificacoesAtivas(): Promise<boolean> {
  if ((await AsyncStorage.getItem(ATIVAS).catch(() => null)) === 'off') return false;
  return (await Notifications.getPermissionsAsync().catch(() => null))?.status === 'granted';
}

async function tokenDoAparelho(): Promise<string | null> {
  const projectId = Constants.expoConfig?.extra?.eas?.projectId as string | undefined;
  try {
    return (await Notifications.getExpoPushTokenAsync({ projectId })).data;
  } catch (err) {
    console.warn('[notificações] sem token de push:', err); // e.g. a build without the FCM config
    return null;
  }
}

/**
 * Registers this device for pushes. `perguntar` shows the system prompt (once, on the first
 * question, or from Ajustes). Returns whether notifications are on.
 */
export async function registrarAparelho(perguntar: boolean): Promise<boolean> {
  if ((await AsyncStorage.getItem(ATIVAS).catch(() => null)) === 'off') return false;
  if (Platform.OS === 'android') {
    await Notifications.setNotificationChannelAsync(CANAL, {
      name: 'Respostas prontas', importance: Notifications.AndroidImportance.HIGH, lightColor: '#f1863d',
    }).catch(() => undefined);
  }
  let { status } = await Notifications.getPermissionsAsync();
  if (status !== 'granted' && perguntar) status = (await Notifications.requestPermissionsAsync()).status;
  if (status !== 'granted') return false;
  token = await tokenDoAparelho();
  if (!token) return false;
  const { error } = await supabase.rpc('registrar_dispositivo', { p_token: token, p_plataforma: Platform.OS });
  if (error) console.warn('[notificações] registro:', error.message);
  return !error;
}

/** The first question asks for permission; later ones only refresh the token. */
export async function aoPerguntar(): Promise<void> {
  const perguntar = !(await AsyncStorage.getItem(PERGUNTADO).catch(() => null));
  if (perguntar) await AsyncStorage.setItem(PERGUNTADO, '1').catch(() => undefined);
  await registrarAparelho(perguntar).catch(() => undefined);
}

/** Stops pushes to this device for the signed-in account (sign-out, or switched off). */
export async function esquecerAparelho(): Promise<void> {
  const atual = token ?? (await tokenDoAparelho());
  if (atual) await supabase.from('dispositivos').delete().eq('token', atual);
}

export async function definirNotificacoes(ativas: boolean): Promise<boolean> {
  await AsyncStorage.setItem(ATIVAS, ativas ? 'on' : 'off').catch(() => undefined);
  if (ativas) return registrarAparelho(true);
  await esquecerAparelho().catch(() => undefined);
  return false;
}

/** Native gets the server push; only the web shows a local notification. */
export function avisarRespostaPronta(_conversa: string, _pergunta: string): void {}

/** Opens the conversation of a tapped notification, including the one that launched the app. */
export function useAbrirNotificacao(abrir: (conversa: string) => void): void {
  const resposta = Notifications.useLastNotificationResponse();
  useEffect(() => {
    if (!resposta || resposta.actionIdentifier !== Notifications.DEFAULT_ACTION_IDENTIFIER) return;
    const id = resposta.notification.request.identifier;
    const conversa = (resposta.notification.request.content.data as { conversa?: unknown } | null)?.conversa;
    if (abertas.has(id) || typeof conversa !== 'string') return;
    abertas.add(id);
    abrir(conversa);
  }, [resposta, abrir]);
}
