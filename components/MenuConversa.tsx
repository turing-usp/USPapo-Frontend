/**
 * Per-conversation actions (favoritar, renomear, apagar): the kebab button in each row and a small
 * glass menu anchored to it. The menu is drawn in the history's `frente` layer, over the list it
 * blurs (a Modal is another window, which the Android blur cannot sample).
 */
import React, { useEffect, useRef, useState } from 'react';
import { Animated, BackHandler, Easing, Platform, Pressable, StyleSheet, View, useWindowDimensions } from 'react-native';

import Glass from './Glass';
import { Icone } from './icons';
import { Texto } from './ui';
import { useTheme } from '../theme';

const LARGURA = 200;
const ALTURA = 140;

/** The kebab button's bottom-right corner, in window coordinates. */
export type Ancora = { x: number; y: number };
export type AcaoConversa = 'favoritar' | 'renomear' | 'apagar';

export function BotaoAcoes({ aoAbrir }: { aoAbrir: (ancora: Ancora) => void }) {
  const { colors } = useTheme();
  const botao = useRef<View>(null);
  return (
    <Pressable ref={botao} accessibilityRole="button" accessibilityLabel="Ações da conversa" hitSlop={6}
      onPress={() => botao.current?.measureInWindow((x, y, w, h) => aoAbrir({ x: x + w, y: y + h }))}
      style={({ pressed }) => ({ padding: 6, opacity: pressed ? 0.6 : 1 })}>
      <Icone nome="kebab" cor={colors.mutedForeground} tamanho={18} />
    </Pressable>
  );
}

/** Must fill the window (its origin is the anchor's). While it fades out it stays where it was. */
export function MenuConversa({ aberto, aoFechar, aoEscolher }: {
  aberto: { favorita: boolean; ancora: Ancora } | null; aoFechar: () => void; aoEscolher: (acao: AcaoConversa) => void;
}) {
  const { colors, radius, spacing } = useTheme();
  const { width, height } = useWindowDimensions();
  const [atual, setAtual] = useState(aberto);
  if (aberto && aberto !== atual) setAtual(aberto);
  const [entrada] = useState(() => new Animated.Value(0));

  useEffect(() => {
    Animated.timing(entrada, { toValue: aberto ? 1 : 0, duration: aberto ? 140 : 110, easing: Easing.out(Easing.cubic), useNativeDriver: true })
      .start(({ finished }) => finished && !aberto && setAtual(null));
  }, [aberto, entrada]);

  // Back (Android) and Escape (web) close it, as they closed the Modal.
  useEffect(() => {
    if (!aberto) return;
    if (Platform.OS === 'web') {
      const tecla = (e: KeyboardEvent) => e.key === 'Escape' && aoFechar();
      window.addEventListener('keydown', tecla);
      return () => window.removeEventListener('keydown', tecla);
    }
    const sub = BackHandler.addEventListener('hardwareBackPress', () => {
      aoFechar();
      return true;
    });
    return () => sub.remove();
  }, [aberto, aoFechar]);

  if (!atual) return null;
  const { x, y } = atual.ancora;
  // Right-aligned to the button; flips above it when the bottom would clip.
  const left = Math.max(8, Math.min(x - LARGURA, width - LARGURA - 8));
  const top = y + ALTURA + 8 < height ? y + 4 : Math.max(8, y - ALTURA - 36);
  const item = (rotulo: string, acao: AcaoConversa, perigo = false) => (
    <Pressable accessibilityRole="button" onPress={() => aoEscolher(acao)}
      style={({ pressed }) => ({ paddingHorizontal: spacing.md, paddingVertical: 11, opacity: pressed ? 0.6 : 1 })}>
      <Texto v={perigo ? 'erro' : 'suave'} cor={perigo ? undefined : colors.foreground}>{rotulo}</Texto>
    </Pressable>
  );

  return (
    <View pointerEvents={aberto ? 'auto' : 'none'} style={StyleSheet.absoluteFill}>
      <Pressable accessibilityLabel="Fechar ações da conversa" onPress={aoFechar} style={StyleSheet.absoluteFill} />
      <Glass desfoque radius={radius.lg} opacidade={entrada} style={{ position: 'absolute', left, top, width: LARGURA, paddingVertical: 4 }}>
        {item(atual.favorita ? 'Remover dos favoritos' : 'Favoritar', 'favoritar')}
        {item('Renomear', 'renomear')}
        {item('Apagar', 'apagar', true)}
      </Glass>
    </View>
  );
}
