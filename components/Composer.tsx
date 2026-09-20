/**
 * The composer — port of the old site's Composer (site/app/components).
 *
 * Layout is the original's exactly: a `glass glass-brand` pill
 * (`rounded-[1.75rem]`, `p-2`, `items-end`) holding a 44pt attach button, an
 * auto-growing input, and a 44pt send button whose inner 36pt disc carries
 * the brand fill. The send arrow only appears once there is text — empty is
 * the "Falar" (microphone) affordance, same as the old site.
 *
 * Both the home screen and the chat screen render this, which is why the
 * growing-height logic lives here rather than in either of them.
 */
import React, { useState } from 'react';
import {
  Pressable,
  StyleSheet,
  TextInput,
  View,
  type NativeSyntheticEvent,
  type TextInputContentSizeChangeEventData,
} from 'react-native';
import { Path, Svg } from 'react-native-svg';

import { haptics } from '../lib/haptics';
import { useTheme } from '../theme';

/** `p-2` + `rounded-[1.75rem]` on the wrapper. */
const RAIO = 28;
/** `h-11 w-11` hit targets, with the brand disc at `h-9 w-9` inside. */
const ALVO = 44;
const DISCO = 36;
/** `leading-6` on the input, and the old `max-h-[40vh]` ceiling. */
const LINHA = 24;
const ALTURA_MAX = 160;

const ICONE_ANEXAR = 'M12 5v14m-7-7h14';
const ICONE_ENVIAR = 'M12 19V5m0 0l-6 6m6-6l6 6';
/** Stop square, for the streaming state. */
const ICONE_PARAR = 'M6.75 6.75h10.5v10.5H6.75z';
const ICONE_MICROFONE = [
  'M12 18.75a6 6 0 006-6v-1.5m-6 7.5a6 6 0 01-6-6v-1.5m6 7.5v3.75m-3.75 0h7.5M12 15.75a3 3 0 01-3-3V4.5a3 3 0 116 0v8.25a3 3 0 01-3 3z',
];

function Icone({
  color,
  d,
  size = 24,
  strokeWidth = 2,
}: {
  color: string;
  d: string | string[];
  size?: number;
  strokeWidth?: number;
}) {
  return (
    <Svg width={size} height={size} viewBox="0 0 24 24">
      {(Array.isArray(d) ? d : [d]).map((path) => (
        <Path
          key={path}
          d={path}
          fill="none"
          stroke={color}
          strokeWidth={strokeWidth}
          strokeLinecap="round"
          strokeLinejoin="round"
        />
      ))}
    </Svg>
  );
}

export type ComposerProps = {
  value: string;
  onChange: (texto: string) => void;
  onSubmit: (texto: string) => void;
  disabled?: boolean;
  /** Old placeholder, overridable for the chat screen's follow-up prompt. */
  placeholder?: string;
  /** Attach is UI-only until the backend accepts files; hidden by default. */
  onAttach?: () => void;
  /** Streaming: the send disc becomes a Stop control. */
  respondendo?: boolean;
  onStop?: () => void;
};

export default function Composer({
  value,
  onChange,
  onSubmit,
  disabled = false,
  placeholder = 'Pesquise sobre a USP',
  onAttach,
  respondendo = false,
  onStop,
}: ComposerProps) {
  const { colors, fonts, glass, radius, typography } = useTheme();
  const [altura, setAltura] = useState(LINHA);

  const temTexto = value.trim().length > 0;
  const podeEnviar = temTexto && !disabled && !respondendo;

  const aoMedir = (
    evento: NativeSyntheticEvent<TextInputContentSizeChangeEventData>,
  ): void => {
    const medida = evento.nativeEvent.contentSize.height;
    setAltura(Math.min(Math.max(LINHA, medida), ALTURA_MAX));
  };

  return (
    <View
      style={[
        styles.pilula,
        glass.surface,
        glass.brand,
        glass.shadow,
        { borderRadius: RAIO },
      ]}
    >
      <Pressable
        accessibilityLabel="Anexar arquivo"
        onPress={onAttach}
        disabled={!onAttach}
        style={[styles.alvo, { borderRadius: radius.full, opacity: onAttach ? 1 : 0 }]}
      >
        <Icone color={colors.mutedForeground} d={ICONE_ANEXAR} />
      </Pressable>

      <TextInput
        value={value}
        onChangeText={onChange}
        onContentSizeChange={aoMedir}
        onSubmitEditing={() => podeEnviar && onSubmit(value)}
        editable={!disabled && !respondendo}
        multiline
        blurOnSubmit={false}
        submitBehavior="submit"
        placeholder={placeholder}
        placeholderTextColor={colors.mutedForeground}
        selectionColor={colors.brand}
        style={[
          styles.entrada,
          {
            color: colors.foreground,
            fontFamily: fonts.body,
            fontSize: typography.base.fontSize,
            height: altura + 20,
            lineHeight: LINHA,
          },
        ]}
      />

      <Pressable
        accessibilityLabel={
          respondendo ? 'Parar' : temTexto ? 'Enviar pergunta' : 'Falar'
        }
        onPress={() => {
          if (respondendo) {
            void haptics.press();
            onStop?.();
            return;
          }
          if (podeEnviar) onSubmit(value);
        }}
        disabled={disabled && !respondendo}
        style={({ pressed }) => [
          styles.alvo,
          {
            borderRadius: radius.full,
            opacity: disabled && !respondendo ? 0.6 : pressed ? 0.85 : 1,
          },
        ]}
      >
        {respondendo || temTexto ? (
          <View
            style={[
              styles.disco,
              {
                backgroundColor: respondendo ? colors.danger : colors.brand,
                borderRadius: radius.full,
              },
            ]}
          >
            <Icone
              color={colors.brandForeground}
              d={respondendo ? ICONE_PARAR : ICONE_ENVIAR}
              size={20}
              strokeWidth={2.5}
            />
          </View>
        ) : (
          <Icone color={colors.mutedForeground} d={ICONE_MICROFONE} />
        )}
      </Pressable>
    </View>
  );
}

const styles = StyleSheet.create({
  pilula: {
    flexDirection: 'row',
    alignItems: 'flex-end',
    gap: 4,
    padding: 8,
    width: '100%',
  },
  alvo: {
    width: ALVO,
    height: ALVO,
    alignItems: 'center',
    justifyContent: 'center',
    flexShrink: 0,
  },
  disco: {
    width: DISCO,
    height: DISCO,
    alignItems: 'center',
    justifyContent: 'center',
  },
  entrada: {
    flex: 1,
    minWidth: 0,
    paddingVertical: 10,
    paddingHorizontal: 4,
    // RN Web draws a focus ring on the DOM input; the glass-field edge is
    // the old site's focus affordance instead.
    outlineStyle: 'none',
  } as object,
});
