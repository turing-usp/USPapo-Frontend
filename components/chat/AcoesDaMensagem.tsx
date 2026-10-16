/**
 * Copiar and Compartilhar for a question or an answer: small buttons under it, and on Android and
 * iOS the same two in a menu on a long press (`Segurar`). The web has the buttons only (a long
 * press there selects text).
 */
import * as Clipboard from 'expo-clipboard';
import React, { createContext, useCallback, useContext, useMemo, useState, type ReactNode } from 'react';
import { AccessibilityInfo, Platform, Pressable, Share, View, type StyleProp, type ViewStyle } from 'react-native';
import { Gesture, GestureDetector } from 'react-native-gesture-handler';

import { Icone, type NomeIcone } from '../icons';
import { MenuAncorado, ancoraDoToque, type Ancora, type ItemDoMenu } from '../MenuAncorado';
import { haptics } from '../../lib/device';
import { alfa, useTheme } from '../../theme';

/** The web shares only where the browser can; Android and iOS always can. */
const PODE_COMPARTILHAR = Platform.OS !== 'web' || (typeof navigator !== 'undefined' && typeof navigator.share === 'function');
const ICONE_COMPARTILHAR: NomeIcone = Platform.OS === 'ios' ? 'compartilharIos' : 'compartilhar';

async function copiar(texto: string): Promise<boolean> {
  const ok = await Clipboard.setStringAsync(texto).catch(() => false);
  void (ok ? haptics.selection() : haptics.error());
  if (ok && Platform.OS !== 'web') AccessibilityInfo.announceForAccessibility('Copiado');
  return ok;
}

function compartilhar(texto: string): void {
  Share.share({ message: texto }).catch(() => undefined);
}

function itensPara(texto: string): ItemDoMenu[] {
  const copia: ItemDoMenu = { icone: 'copiar', rotulo: 'Copiar', acao: () => void copiar(texto) };
  return PODE_COMPARTILHAR ? [copia, { icone: ICONE_COMPARTILHAR, rotulo: 'Compartilhar', acao: () => compartilhar(texto) }] : [copia];
}

const AbrirMenu = createContext<(texto: string, ancora: Ancora) => void>(() => undefined);

/** One menu for every message of a screen; must start at the window's origin, like the menu itself. */
export function MenuDasMensagens({ children }: { children: ReactNode }) {
  const [menu, setMenu] = useState<{ texto: string; ancora: Ancora } | null>(null);
  const abrir = useCallback((texto: string, ancora: Ancora) => setMenu({ texto, ancora }), []);
  const fechar = useCallback(() => setMenu(null), []);
  return (
    <AbrirMenu.Provider value={abrir}>
      {children}
      <MenuAncorado aberto={menu && { ancora: menu.ancora, itens: itensPara(menu.texto) }} aoFechar={fechar} />
    </AbrirMenu.Provider>
  );
}

/** A long press on the message opens its menu; `texto` null (an answer still being written) does nothing. */
export function Segurar({ texto, children }: { texto: string | null; children: ReactNode }) {
  const abrir = useContext(AbrirMenu);
  const gesto = useMemo(() => Gesture.LongPress().enabled(texto !== null).minDuration(400).runOnJS(true).onStart((e) => {
    if (texto === null) return;
    void haptics.segurar();
    abrir(texto, ancoraDoToque(e.absoluteX, e.absoluteY));
  }), [texto, abrir]);
  if (Platform.OS === 'web') return <>{children}</>;
  return <GestureDetector gesture={gesto}><View collapsable={false}>{children}</View></GestureDetector>;
}

function BotaoDeIcone({ icone, rotulo, cor, onPress }: { icone: NomeIcone; rotulo: string; cor?: string; onPress: () => void }) {
  const { colors, radius } = useTheme();
  return (
    <Pressable accessibilityRole="button" accessibilityLabel={rotulo} onPress={onPress} hitSlop={4}
      style={({ pressed }) => ({ width: 32, height: 32, alignItems: 'center', justifyContent: 'center', borderRadius: radius.md,
        backgroundColor: pressed ? alfa(colors.foreground, 0.08) : 'transparent' })}>
      <Icone nome={icone} cor={cor ?? colors.mutedForeground} tamanho={17} />
    </Pressable>
  );
}

/** The buttons: Copiar turns into a check for a moment once the text is on the clipboard. */
export function BotoesDaMensagem({ texto, style }: { texto: string; style?: StyleProp<ViewStyle> }) {
  const { colors } = useTheme();
  const [copiado, setCopiado] = useState(false);
  return (
    <View style={[{ flexDirection: 'row', alignItems: 'center', gap: 2 }, style]}>
      <BotaoDeIcone icone={copiado ? 'check' : 'copiar'} rotulo={copiado ? 'Copiado' : 'Copiar'} cor={copiado ? colors.accent : undefined}
        onPress={() => void copiar(texto).then((ok) => {
          if (!ok) return;
          setCopiado(true);
          setTimeout(() => setCopiado(false), 1500);
        })} />
      {PODE_COMPARTILHAR ? <BotaoDeIcone icone={ICONE_COMPARTILHAR} rotulo="Compartilhar" onPress={() => compartilhar(texto)} /> : null}
    </View>
  );
}
