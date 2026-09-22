/** Per-conversation actions (favoritar, renomear, apagar) in a small menu anchored to the kebab button. */
import React, { useRef, useState } from 'react';
import { Modal, Pressable, View, useWindowDimensions } from 'react-native';

import Glass from './Glass';
import { Icone } from './icons';
import { Texto } from './ui';
import { useTheme } from '../theme';

const LARGURA = 200;
const ALTURA = 140;

export function MenuConversa({ favorita, aoFavoritar, aoRenomear, aoApagar }: {
  favorita: boolean; aoFavoritar: () => void; aoRenomear: () => void; aoApagar: () => void;
}) {
  const { colors, radius, spacing } = useTheme();
  const { width, height } = useWindowDimensions();
  const [ancora, setAncora] = useState<{ x: number; y: number } | null>(null);
  const botao = useRef<View>(null);

  const item = (rotulo: string, acao: () => void, perigo = false) => (
    <Pressable accessibilityRole="button" onPress={() => { setAncora(null); acao(); }}
      style={({ pressed }) => ({ paddingHorizontal: spacing.md, paddingVertical: 11, opacity: pressed ? 0.6 : 1 })}>
      <Texto v={perigo ? 'erro' : 'suave'} cor={perigo ? undefined : colors.foreground}>{rotulo}</Texto>
    </Pressable>
  );

  // Right-aligned to the button; flips above it when the bottom would clip.
  const left = ancora ? Math.max(8, Math.min(ancora.x - LARGURA, width - LARGURA - 8)) : 0;
  const top = ancora ? (ancora.y + ALTURA + 8 < height ? ancora.y + 4 : Math.max(8, ancora.y - ALTURA - 36)) : 0;

  return (
    <>
      <Pressable ref={botao} accessibilityRole="button" accessibilityLabel="Ações da conversa" hitSlop={6}
        onPress={() => botao.current?.measureInWindow((x, y, w, h) => setAncora({ x: x + w, y: y + h }))}
        style={({ pressed }) => ({ padding: 6, opacity: pressed ? 0.6 : 1 })}>
        <Icone nome="kebab" cor={colors.mutedForeground} tamanho={18} />
      </Pressable>
      {/* A Modal: an in-row dropdown would be painted under the next rows of the list. */}
      <Modal visible={!!ancora} transparent animationType="fade" onRequestClose={() => setAncora(null)}>
        <Pressable style={{ flex: 1 }} onPress={() => setAncora(null)}>
          <Glass variante="raised" radius={radius.lg} style={{ position: 'absolute', left, top, width: LARGURA, paddingVertical: 4 }}>
            {item(favorita ? 'Remover dos favoritos' : 'Favoritar', aoFavoritar)}
            {item('Renomear', aoRenomear)}
            {item('Apagar', aoApagar, true)}
          </Glass>
        </Pressable>
      </Modal>
    </>
  );
}
