/**
 * Small opaque-glass menus anchored to what opened them: the kebab button of a conversation in the
 * drawer, or a finger's long press (a conversation, a message).
 */
import React, { useEffect, useRef, useState } from 'react';
import { Animated, BackHandler, Easing, Platform, Pressable, StyleSheet, View, useWindowDimensions } from 'react-native';

import Glass from './Glass';
import { Icone, type NomeIcone } from './icons';
import { ItemDeMenu, tintaDoToque } from './ui';
import { useTheme } from '../theme';

const LARGURA = 220;
/** One 44pt row; the menu's padding adds 8. */
const LINHA = 44;

/** What opened the menu, in window coordinates: the menu opens below it (above when the bottom would clip), right-aligned to it. */
export type Ancora = { direita: number; topo: number; base: number };
export type ItemDoMenu = { icone: NomeIcone; rotulo: string; acao: () => void };
export type MenuAberto = { itens: ItemDoMenu[]; ancora: Ancora };

/** A long press at (x, y): the menu opens centered under the finger, or above it. */
export const ancoraDoToque = (x: number, y: number): Ancora => ({ direita: x + LARGURA / 2, topo: y - 12, base: y + 12 });

/** The kebab button; `aoSobrevoar` tells its row whether the mouse is over it (web), so the row stays lit. */
export function BotaoAcoes({ rotulo, aoAbrir, aoSobrevoar }: {
  rotulo: string; aoAbrir: (ancora: Ancora) => void; aoSobrevoar?: (sobre: boolean) => void;
}) {
  const { colors, radius } = useTheme();
  const botao = useRef<View>(null);
  return (
    <Pressable ref={botao} accessibilityRole="button" accessibilityLabel={rotulo} hitSlop={6}
      onPress={() => botao.current?.measureInWindow((x, y, w, h) => aoAbrir({ direita: x + w, topo: y, base: y + h }))}
      onHoverIn={() => aoSobrevoar?.(true)} onHoverOut={() => aoSobrevoar?.(false)}
      style={(estado) => ({ padding: 6, borderRadius: radius.md, backgroundColor: tintaDoToque(estado, colors.foreground) })}>
      <Icone nome="kebab" cor={colors.mutedForeground} tamanho={18} />
    </Pressable>
  );
}

/**
 * Its parent must start at the window's origin (the anchor is in window coordinates). A new menu is
 * a new anchor; while it fades out it stays where it was. Choosing an item closes it.
 */
export function MenuAncorado({ aberto, aoFechar }: { aberto: MenuAberto | null; aoFechar: () => void }) {
  const { radius, spacing } = useTheme();
  const { width, height } = useWindowDimensions();
  const [ultimo, setUltimo] = useState(aberto);
  if (aberto && aberto.ancora !== ultimo?.ancora) setUltimo(aberto);
  const [entrada] = useState(() => new Animated.Value(0));
  const visivel = !!aberto;

  useEffect(() => {
    Animated.timing(entrada, { toValue: visivel ? 1 : 0, duration: visivel ? 140 : 110, easing: Easing.out(Easing.cubic), useNativeDriver: true })
      .start(({ finished }) => finished && !visivel && setUltimo(null));
  }, [visivel, entrada]);

  // Back (Android) and Escape (web) close it, as they closed the Modal.
  useEffect(() => {
    if (!visivel) return;
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
  }, [visivel, aoFechar]);

  const menu = aberto ?? ultimo;
  if (!menu) return null;
  const { direita, topo, base } = menu.ancora;
  const altura = menu.itens.length * LINHA + 8;
  const left = Math.max(8, Math.min(direita - LARGURA, width - LARGURA - 8));
  const top = base + altura + 8 < height ? base + 4 : Math.max(8, topo - altura - 4);

  return (
    <View pointerEvents={visivel ? 'auto' : 'none'} style={[StyleSheet.absoluteFill, { zIndex: 10 }]}>
      <Pressable accessibilityLabel="Fechar menu" onPress={aoFechar} style={StyleSheet.absoluteFill} />
      <Glass opaco radius={radius.lg} opacidade={entrada} style={{ position: 'absolute', left, top, width: LARGURA, padding: spacing.xs }}>
        {menu.itens.map((item) => (
          <ItemDeMenu key={item.rotulo} icone={item.icone} rotulo={item.rotulo} onPress={() => {
            aoFechar();
            item.acao();
          }} />
        ))}
      </Glass>
    </View>
  );
}
