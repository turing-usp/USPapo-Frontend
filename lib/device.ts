/** Device affordances: haptics (user-toggleable), keyboard height and voice dictation. */
import AsyncStorage from '@react-native-async-storage/async-storage';
import * as Haptics from 'expo-haptics';
import { ExpoSpeechRecognitionModule, useSpeechRecognitionEvent } from 'expo-speech-recognition';
import { useEffect, useRef, useState } from 'react';
import { Keyboard, Platform } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

const HAPTICS_KEY = 'haptics:enabled';
let vibrar = true;

export async function carregarHaptics(): Promise<boolean> {
  vibrar = (await AsyncStorage.getItem(HAPTICS_KEY).catch(() => null)) !== 'off';
  return vibrar;
}

export async function definirHaptics(ativo: boolean): Promise<void> {
  vibrar = ativo;
  await AsyncStorage.setItem(HAPTICS_KEY, ativo ? 'on' : 'off').catch(() => undefined);
}

// Throttled per channel so a burst of events is felt once. Never throws.
const ultimo: Record<string, number> = {};
function sentir(canal: string, janela: number, efeito: () => Promise<void>): void {
  const agora = Date.now();
  if (!vibrar || Platform.OS === 'web' || agora - (ultimo[canal] ?? 0) < janela) return;
  ultimo[canal] = agora;
  efeito().catch(() => undefined);
}

const { ImpactFeedbackStyle: I, NotificationFeedbackType: N } = Haptics;
export const haptics = {
  selection: () => sentir('selection', 60, Haptics.selectionAsync),
  send: () => sentir('impact', 90, () => Haptics.impactAsync(I.Light)),
  press: () => sentir('impact', 90, () => Haptics.impactAsync(I.Medium)),
  like: () => sentir('notification', 400, () => Haptics.notificationAsync(N.Success)),
  dislike: () => sentir('notification', 400, () => Haptics.notificationAsync(N.Warning)),
  error: () => sentir('notification', 400, () => Haptics.notificationAsync(N.Error)),
  finished: () => sentir('notification', 400, () => Haptics.notificationAsync(N.Success)),
};

/** Keyboard overlap over the bottom inset (edge-to-edge Android no longer resizes the window). */
export function useAlturaDoTeclado(): number {
  const { bottom } = useSafeAreaInsets();
  const [altura, setAltura] = useState(0);
  useEffect(() => {
    if (Platform.OS === 'web') return;
    const [abrir, fechar] = Platform.OS === 'ios' ? ['keyboardWillShow', 'keyboardWillHide'] as const
      : ['keyboardDidShow', 'keyboardDidHide'] as const;
    const a = Keyboard.addListener(abrir, (e) => setAltura(Math.max(0, (e?.endCoordinates?.height ?? 0) - bottom)));
    const f = Keyboard.addListener(fechar, () => setAltura(0));
    return () => {
      a.remove();
      f.remove();
    };
  }, [bottom]);
  return altura;
}

/** Voice dictation into a text field (pt-BR). `alternar` starts from the current text or stops. */
export function useDitado(aoTexto: (texto: string) => void) {
  const [ouvindo, setOuvindo] = useState(false);
  const [erro, setErro] = useState<string | null>(null);
  const base = useRef('');
  const disponivel = useRef<boolean | null>(null);
  if (disponivel.current === null) {
    try {
      disponivel.current = ExpoSpeechRecognitionModule.isRecognitionAvailable();
    } catch {
      disponivel.current = false;
    }
  }

  useSpeechRecognitionEvent('start', () => setOuvindo(true));
  useSpeechRecognitionEvent('end', () => setOuvindo(false));
  useSpeechRecognitionEvent('result', (e) => {
    const falado = e.results?.[0]?.transcript?.trim();
    if (falado) aoTexto(`${base.current}${base.current && !base.current.endsWith(' ') ? ' ' : ''}${falado}`);
  });
  useSpeechRecognitionEvent('error', (e) => {
    setOuvindo(false);
    if (e.error !== 'aborted' && e.error !== 'no-speech') {
      setErro(e.error === 'not-allowed' ? 'Permita o uso do microfone para ditar.' : 'Não consegui ouvir agora. Tente de novo.');
    }
  });

  async function alternar(textoAtual: string): Promise<void> {
    setErro(null);
    if (ouvindo) {
      ExpoSpeechRecognitionModule.stop();
      return;
    }
    const permissao = await ExpoSpeechRecognitionModule.requestPermissionsAsync().catch(() => ({ granted: false }));
    if (!permissao.granted) {
      setErro('Permita o uso do microfone para ditar.');
      return;
    }
    base.current = textoAtual.trim();
    ExpoSpeechRecognitionModule.start({ lang: 'pt-BR', interimResults: true, continuous: false });
  }

  return { disponivel: !!disponivel.current, ouvindo, erro, alternar };
}
