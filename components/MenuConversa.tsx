/**
 * Per-conversation action menu — port of the old site's MenuConversa
 * (site/components/MenuConversa.tsx): a kebab button that opens a small
 * panel with "Favoritar" / "Remover dos favoritos" and "Apagar".
 *
 * The old site anchored an absolutely positioned `<div>` under the button
 * and closed it on outside-click or Escape. Here the panel lives in a
 * transparent <Modal>, for one structural reason: the rows are FlatList
 * children, and a panel drawn inside row N is painted under row N+1 (later
 * siblings draw on top), so an in-row dropdown would be half-hidden behind
 * the next conversation. The modal also gives the outside-press dismissal
 * and the hardware-back dismissal for free.
 *
 * The button's position is measured when it is pressed, so the panel opens
 * against it rather than in the middle of the screen — and it flips to
 * above the button when there is no room below.
 */
import React, { useRef, useState } from 'react';
import {
  Modal,
  Pressable,
  StyleSheet,
  Text,
  View,
  useWindowDimensions,
} from 'react-native';

import Glass from './Glass';
import { KebabIcon } from './BrandMarks';
import { fonts, useTheme } from '../theme';

/** Panel metrics (the old `w-44` dropdown). */
const LARGURA = 190;
const ALTURA_ESTIMADA = 136;
const MARGEM = 8;

export type MenuConversaProps = {
  favorita: boolean;
  aoFavoritar: () => void;
  aoRenomear: () => void;
  aoApagar: () => void;
};

export function MenuConversa({
  favorita,
  aoFavoritar,
  aoRenomear,
  aoApagar,
}: MenuConversaProps) {
  const { colors, radius, spacing, typography } = useTheme();
  const { width: largura, height: altura } = useWindowDimensions();
  const [aberto, setAberto] = useState(false);
  const [ancora, setAncora] = useState({ x: 0, y: 0 });
  const botaoRef = useRef<View>(null);

  const abrir = () => {
    botaoRef.current?.measureInWindow((x, y, w, h) => {
      setAncora({ x: x + w, y: y + h });
      setAberto(true);
    });
  };

  const executar = (fn: () => void) => () => {
    setAberto(false);
    fn();
  };

  // Right-aligned to the button, flipped up when the bottom would clip it.
  const esquerda = Math.max(MARGEM, Math.min(ancora.x - LARGURA, largura - LARGURA - MARGEM));
  const abaixo = ancora.y + ALTURA_ESTIMADA + MARGEM < altura;
  const topo = abaixo ? ancora.y + 4 : Math.max(MARGEM, ancora.y - ALTURA_ESTIMADA - 28);

  const item = (rotulo: string, aoTocar: () => void, perigo = false) => (
    <Pressable
      onPress={aoTocar}
      accessibilityRole="button"
      style={({ pressed }) => [
        {
          paddingHorizontal: spacing.md,
          paddingVertical: 11,
          opacity: pressed ? 0.6 : 1,
        },
      ]}
    >
      <Text
        style={{
          color: perigo ? colors.danger : colors.foreground,
          fontFamily: fonts.body,
          fontSize: typography.sm.fontSize,
        }}
      >
        {rotulo}
      </Text>
    </Pressable>
  );

  return (
    <>
      <Pressable
        ref={botaoRef}
        onPress={abrir}
        hitSlop={6}
        accessibilityRole="button"
        accessibilityLabel="Ações da conversa"
        style={({ pressed }) => [{ padding: 6, opacity: pressed ? 0.6 : 1 }]}
      >
        <KebabIcon size={18} color={colors.mutedForeground} />
      </Pressable>

      <Modal
        visible={aberto}
        transparent
        animationType="fade"
        onRequestClose={() => setAberto(false)}
      >
        {/* The outside-press catcher (the old document mousedown listener). */}
        <Pressable style={{ flex: 1 }} onPress={() => setAberto(false)}>
          <View
            style={{
              position: 'absolute',
              left: esquerda,
              top: topo,
              width: LARGURA,
            }}
          >
            <Glass variante="raised" radius={radius.lg} style={{ paddingVertical: 4 }}>
              {/* A solid backing under the items. The glass alone is
                  see-through by design, and a menu floating over a list of
                  conversations has the row text running straight through its
                  labels — the old site used an opaque `bg-surface-raised` for
                  the same reason. The glass edge and lift still read around
                  it. */}
              <View
                style={[
                  StyleSheet.absoluteFill,
                  { backgroundColor: colors.surfaceRaised, borderRadius: radius.lg, opacity: 0.94 },
                ]}
              />
              {item(
                favorita ? 'Remover dos favoritos' : 'Favoritar',
                executar(aoFavoritar),
              )}
              {item('Renomear', executar(aoRenomear))}
              {item('Apagar', executar(aoApagar), true)}
            </Glass>
          </View>
        </Pressable>
      </Modal>
    </>
  );
}
