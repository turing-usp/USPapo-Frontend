/**
 * "Answer ready" notifications, web: a local browser notification when an answer finishes while
 * the tab is in the background (no push: a closed tab gets nothing). Same API as notificacoes.ts.
 */
import AsyncStorage from '@react-native-async-storage/async-storage';
import { useEffect } from 'react';

const ATIVAS = 'notificacoes:ativas';
const PERGUNTADO = 'notificacoes:perguntado';
const MAX_CORPO = 120;

export const NOTIFICACOES_DISPONIVEIS = typeof Notification !== 'undefined';
export const DESCRICAO = 'Com esta aba aberta em segundo plano, o navegador avisa quando a resposta termina.';

let abrirConversa: ((conversa: string) => void) | null = null;

export function focarConversa(_id: string | null): void {}

async function ligadas(): Promise<boolean> {
  return (await AsyncStorage.getItem(ATIVAS).catch(() => null)) !== 'off';
}

export async function notificacoesAtivas(): Promise<boolean> {
  return NOTIFICACOES_DISPONIVEIS && Notification.permission === 'granted' && (await ligadas());
}

export async function registrarAparelho(perguntar: boolean): Promise<boolean> {
  if (!NOTIFICACOES_DISPONIVEIS || !(await ligadas())) return false;
  if (Notification.permission === 'default' && perguntar) await Notification.requestPermission().catch(() => undefined);
  return Notification.permission === 'granted';
}

/** Runs inside the send click: browsers only show the permission prompt for a user gesture. */
export async function aoPerguntar(): Promise<void> {
  if (!NOTIFICACOES_DISPONIVEIS || Notification.permission !== 'default') return;
  if (await AsyncStorage.getItem(PERGUNTADO).catch(() => null)) return;
  await AsyncStorage.setItem(PERGUNTADO, '1').catch(() => undefined);
  await registrarAparelho(true);
}

export async function esquecerAparelho(): Promise<void> {}

export async function definirNotificacoes(ativas: boolean): Promise<boolean> {
  await AsyncStorage.setItem(ATIVAS, ativas ? 'on' : 'off').catch(() => undefined);
  return ativas ? registrarAparelho(true) : false;
}

export function avisarRespostaPronta(conversa: string, pergunta: string): void {
  if (!NOTIFICACOES_DISPONIVEIS || Notification.permission !== 'granted' || document.visibilityState === 'visible') return;
  void ligadas().then((sim) => {
    if (!sim) return;
    const texto = pergunta.replace(/\s+/g, ' ').trim();
    const aviso = new Notification('Sua resposta está pronta', {
      body: texto.length > MAX_CORPO ? `${texto.slice(0, MAX_CORPO - 1)}…` : texto, tag: conversa, icon: '/icon-192.png',
    });
    aviso.onclick = () => {
      window.focus();
      abrirConversa?.(conversa);
      aviso.close();
    };
  });
}

export function useAbrirNotificacao(abrir: (conversa: string) => void): void {
  useEffect(() => {
    abrirConversa = abrir;
    return () => {
      if (abrirConversa === abrir) abrirConversa = null;
    };
  }, [abrir]);
}
