/**
 * The composer: a brand-edged glass pill with an auto-growing input, voice
 * dictation (mic) and send/stop. Enter sends on web (Shift+Enter breaks the line).
 */
import React, { useEffect, useRef, useState } from 'react';
import { Platform, Pressable, StyleSheet, TextInput, View, type NativeSyntheticEvent, type TextInputKeyPressEventData } from 'react-native';

import Glass from './Glass';
import { Icone } from './icons';
import { Texto } from './ui';
import { useDitado } from '../lib/device';
import { useTheme } from '../theme';

const ALVO = 44;
const LINHA = 24;
const PADDING_V = 10;
const ALTURA_MAX = LINHA * 6 + PADDING_V * 2;
const limitar = (h: number) => (Number.isFinite(h) && h > 0 ? Math.min(Math.max(ALVO, Math.ceil(h)), ALTURA_MAX) : ALVO);

export type ComposerProps = {
  value: string;
  onChange: (texto: string) => void;
  onSubmit: (texto: string) => void;
  placeholder?: string;
  respondendo?: boolean;
  onStop?: () => void;
  desfoque?: boolean;
};

export default function Composer({ value, onChange, onSubmit, placeholder = 'Pergunte sobre a USP', respondendo, onStop, desfoque }: ComposerProps) {
  const { colors, fonts, radius, typography } = useTheme();
  const [altura, setAltura] = useState(ALVO);
  const entrada = useRef<TextInput | null>(null);
  const ditado = useDitado(onChange);
  const temTexto = value.trim().length > 0;
  const enviar = () => {
    if (!temTexto || respondendo) return;
    if (ditado.ouvindo) void ditado.alternar(value);
    onSubmit(value);
  };

  // Web: release the height before reading scrollHeight, or every keystroke ratchets the box up.
  useEffect(() => {
    if (Platform.OS !== 'web') return;
    const no = entrada.current as unknown as HTMLTextAreaElement | null;
    if (!no?.style) return;
    const anterior = no.style.height;
    no.style.height = 'auto';
    const conteudo = no.scrollHeight;
    no.style.height = anterior;
    setAltura(limitar(conteudo));
  }, [value]);

  const aoTeclar = (e: NativeSyntheticEvent<TextInputKeyPressEventData>) => {
    const tecla = e.nativeEvent as TextInputKeyPressEventData & { shiftKey?: boolean; isComposing?: boolean };
    if (Platform.OS !== 'web' || tecla.key !== 'Enter' || tecla.shiftKey || tecla.isComposing) return;
    (e as unknown as { preventDefault: () => void }).preventDefault();
    enviar();
  };

  const acao = respondendo
    ? { rotulo: 'Parar', icone: 'parar' as const, fundo: colors.danger, aoTocar: onStop }
    : temTexto
      ? { rotulo: 'Enviar pergunta', icone: 'enviar' as const, fundo: colors.brand, aoTocar: enviar }
      : null;

  return (
    <View>
      <Glass variante="brand" desfoque={desfoque} radius={28} borda={{ borderColor: colors.brand, borderWidth: 1.5 }} style={styles.pilula}>
        <TextInput
          ref={entrada}
          {...(Platform.OS === 'web' ? { rows: 1 } : null)}
          value={value}
          onChangeText={onChange}
          onContentSizeChange={(e) => Platform.OS !== 'web' && setAltura(limitar(e.nativeEvent.contentSize.height + PADDING_V * 2))}
          onKeyPress={aoTeclar}
          onSubmitEditing={enviar}
          submitBehavior="submit"
          editable={!respondendo}
          multiline
          maxLength={4000}
          placeholder={ditado.ouvindo ? 'Ouvindo…' : placeholder}
          placeholderTextColor={colors.mutedForeground}
          selectionColor={colors.brand}
          accessibilityLabel="Pergunta"
          style={[styles.entrada, { color: colors.foreground, fontFamily: fonts.body, fontSize: typography.base.fontSize, height: altura }]}
        />
        {ditado.disponivel && !respondendo ? (
          <Pressable accessibilityRole="button" accessibilityLabel={ditado.ouvindo ? 'Parar ditado' : 'Ditar pergunta'}
            onPress={() => void ditado.alternar(value)} style={[styles.alvo, { borderRadius: radius.full, backgroundColor: ditado.ouvindo ? colors.brand + '26' : 'transparent' }]}>
            <Icone nome="microfone" cor={ditado.ouvindo ? colors.brand : colors.mutedForeground} tamanho={22} traco={2} />
          </Pressable>
        ) : null}
        {acao ? (
          <Pressable accessibilityRole="button" accessibilityLabel={acao.rotulo} onPress={acao.aoTocar} style={styles.alvo}>
            <View style={[styles.disco, { backgroundColor: acao.fundo, borderRadius: radius.full }]}>
              <Icone nome={acao.icone} cor={colors.brandForeground} tamanho={20} traco={2.5} />
            </View>
          </Pressable>
        ) : null}
      </Glass>
      {ditado.erro ? <Texto v="erro" centro style={{ marginTop: 6 }}>{ditado.erro}</Texto> : null}
    </View>
  );
}

const styles = StyleSheet.create({
  pilula: { flexDirection: 'row', alignItems: 'center', gap: 4, padding: 8, paddingLeft: 16, width: '100%' },
  alvo: { width: ALVO, height: ALVO, alignItems: 'center', justifyContent: 'center' },
  disco: { width: 36, height: 36, alignItems: 'center', justifyContent: 'center' },
  // position: relative lifts the web textarea above the glass layers.
  entrada: { flex: 1, minWidth: 0, position: 'relative', paddingVertical: PADDING_V, lineHeight: LINHA, textAlignVertical: 'center', outlineStyle: 'none' } as object,
});
