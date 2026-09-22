/**
 * The composer — port of the old site's Composer (site/app/components).
 *
 * Layout is the original's exactly: a `glass glass-brand` pill
 * (`rounded-[1.75rem]`, `p-2`) holding a 44pt attach button, an auto-growing
 * input, and a 44pt send button whose inner 36pt disc carries the brand fill.
 * The send arrow only appears once there is text — empty is the "Falar"
 * (microphone) affordance, same as the old site.
 *
 * Both the home screen and the chat screen render this, which is why the
 * growing-height logic lives here rather than in either of them.
 *
 * TWO THINGS ARE PLATFORM-SPECIFIC AND BOTH ARE LOAD-BEARING:
 *
 * 1. THE HEIGHT. `onContentSizeChange` does not mean the same thing on both
 *    platforms. On native it reports the height of the CONTENT. On web
 *    (react-native-web's TextInput) it reports `hostNode.scrollHeight`, and
 *    for a textarea that value is never smaller than the element's own box —
 *    so feeding it back into `height` makes every keystroke measure the
 *    height the previous keystroke set. That is exactly the bug the web app
 *    had: the input grew ~20px per typed letter until it hit the ceiling.
 *    The web path therefore RELEASES the height before measuring
 *    (`height: auto` → read `scrollHeight` → restore), which makes the
 *    measurement a function of the text and nothing else.
 *
 * 2. ENTER. Native gets `onSubmitEditing` (with `submitBehavior="submit"`).
 *    On web react-native-web only forwards Enter to `onSubmitEditing` when
 *    the field blurs on submit, which a chat composer must not do — so Enter
 *    is handled here, on the key event: Enter sends, Shift+Enter (and the
 *    other modifiers) insert a line break, and a key that an IME is still
 *    composing is left alone.
 */
import React, { useCallback, useEffect, useRef, useState } from 'react';
import {
  Platform,
  Pressable,
  StyleSheet,
  TextInput,
  View,
  type NativeSyntheticEvent,
  type TextInputContentSizeChangeEventData,
  type TextInputKeyPressEventData,
} from 'react-native';
import { Path, Svg } from 'react-native-svg';

import Glass from './Glass';
import { haptics } from '../lib/haptics';
import { useTheme } from '../theme';

/** `p-2` + `rounded-[1.75rem]` on the wrapper. */
const RAIO = 28;
/** `h-11 w-11` hit targets, with the brand disc at `h-9 w-9` inside. */
const ALVO = 44;
const DISCO = 36;
/** `leading-6` on the input. */
const LINHA = 24;
/** `styles.entrada.paddingVertical`, on both edges. */
const PADDING_V = 10;
/** The old `max-h-[40vh]` ceiling, expressed in lines of text. */
const LINHAS_MAX = 6;
/** Tallest the input box may get (content + its own padding). */
const ALTURA_MAX = LINHA * LINHAS_MAX + PADDING_V * 2;

const ICONE_ANEXAR = 'M12 5v14m-7-7h14';
const ICONE_ENVIAR = 'M12 19V5m0 0l-6 6m6-6l6 6';
/** Stop square, for the streaming state. */
const ICONE_PARAR = 'M6.75 6.75h10.5v10.5H6.75z';
/**
 * The old site's microphone, verbatim. The Heroicons mic used before sits
 * low in its 24x24 box, which read as the button being off-centre.
 */
const ICONE_MICROFONE = [
  'M12 3a3 3 0 0 0-3 3v6a3 3 0 0 0 6 0V6a3 3 0 0 0-3-3Z',
  'M18 11a6 6 0 0 1-12 0M12 17v4m-3 0h6',
];

/**
 * `rows: 1`, web only.
 *
 * react-native-web renders a multiline TextInput as a `<textarea>` and only
 * sets `rows` when it is asked to — with the attribute absent the browser
 * applies its own default of TWO, so releasing the height to measure the text
 * (see `medirNoNavegador`) would measure an empty composer as two lines tall.
 * One row is the floor the measurement needs; the growth comes from
 * `scrollHeight`, which is the CONTENT and grows past a one-row box.
 *
 * Native is left out on purpose: `rows`/`numberOfLines` on an Android
 * multiline input caps the visible lines instead of seeding a measurement.
 */
const UMA_LINHA = Platform.OS === 'web' ? ({ rows: 1 } as object) : null;

/** The measured height, kept inside the box the pill can actually draw. */
function limitar(bruto: number): number {
  if (!Number.isFinite(bruto) || bruto <= 0) return ALVO;
  return Math.min(Math.max(ALVO, Math.ceil(bruto)), ALTURA_MAX);
}

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
  const [altura, setAltura] = useState(ALVO);
  const refEntrada = useRef<TextInput | null>(null);

  const temTexto = value.trim().length > 0;
  const podeEnviar = temTexto && !disabled && !respondendo;

  /**
   * The web measurement. `scrollHeight` is `max(content, clientHeight)`, so
   * the element's own height has to come off before it is read — otherwise
   * the value is whatever the last render set and the box ratchets upwards
   * on every keystroke. Restoring the inline value keeps React the owner of
   * the style: the next render writes it again anyway.
   */
  const medirNoNavegador = useCallback(() => {
    const no = refEntrada.current as unknown as HTMLTextAreaElement | null;
    if (!no || typeof no.scrollHeight !== 'number') return;
    const anterior = no.style.height;
    no.style.height = 'auto';
    const conteudo = no.scrollHeight;
    no.style.height = anterior;
    setAltura(limitar(conteudo));
  }, []);

  // After the DOM has the new text, never during the keystroke: the measure
  // has to see the value React just committed.
  useEffect(() => {
    if (Platform.OS === 'web') medirNoNavegador();
  }, [value, medirNoNavegador]);

  /**
   * The native measurement. Here `contentSize.height` really is the content,
   * and the input's own vertical padding has to be added on top of it. The
   * ALVO floor is what keeps a single line exactly as tall as the 44pt
   * buttons beside it (Android reports a taller content box than the bare
   * line height, and that difference is absorbed by the floor).
   */
  const aoMedir = (
    evento: NativeSyntheticEvent<TextInputContentSizeChangeEventData>,
  ): void => {
    if (Platform.OS === 'web') return;
    const medida = evento.nativeEvent.contentSize.height;
    setAltura(limitar(medida + PADDING_V * 2));
  };

  /**
   * Enter sends, Shift+Enter breaks the line (web only — native routes Enter
   * through `onSubmitEditing`). `preventDefault` is what stops the browser
   * from ALSO inserting the newline it was about to insert.
   */
  const aoTeclar = (
    evento: NativeSyntheticEvent<TextInputKeyPressEventData>,
  ): void => {
    if (Platform.OS !== 'web') return;
    const bruto = evento as unknown as {
      preventDefault?: () => void;
      nativeEvent: {
        key?: string;
        shiftKey?: boolean;
        altKey?: boolean;
        ctrlKey?: boolean;
        metaKey?: boolean;
        isComposing?: boolean;
        keyCode?: number;
      };
    };
    const tecla = bruto.nativeEvent;
    if (tecla.key !== 'Enter') return;
    // An IME is still composing (keyCode 229 is the W3C marker): the Enter
    // belongs to the candidate window, not to us.
    if (tecla.isComposing || tecla.keyCode === 229) return;
    // Any modifier means "new line", which is the browser's own default.
    if (tecla.shiftKey || tecla.altKey || tecla.ctrlKey || tecla.metaKey) return;
    bruto.preventDefault?.();
    if (podeEnviar) onSubmit(value);
  };

  return (
    <Glass
      variante="brand"
      radius={RAIO}
      borda={glass.brand}
      style={styles.pilula}
    >
      <Pressable
        accessibilityLabel="Anexar arquivo"
        onPress={onAttach}
        disabled={!onAttach}
        style={[styles.alvo, { borderRadius: radius.full }]}
      >
        <Icone color={colors.mutedForeground} d={ICONE_ANEXAR} />
      </Pressable>

      <TextInput
        ref={refEntrada}
        {...UMA_LINHA}
        value={value}
        onChangeText={onChange}
        onContentSizeChange={aoMedir}
        onKeyPress={aoTeclar}
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
            height: altura,
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
    </Glass>
  );
}

const styles = StyleSheet.create({
  pilula: {
    flexDirection: 'row',
    // The 44pt controls sit on the input's centre line, not on its baseline:
    // with `flex-end` the + and the microphone hung below the text as soon as
    // the box was taller than one line.
    alignItems: 'center',
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
    // Load-bearing on web, inert on native (relative is the RN
    // default): a react-native-web TextInput is a bare DOM input with
    // no `position`, so it is a STATIC box and paints under the
    // glass pane's absolutely positioned layers — the typed text
    // simply did not show. See components/Glass.
    position: 'relative',
    paddingVertical: PADDING_V,
    textAlignVertical: 'center',
    paddingHorizontal: 4,
    // RN Web draws a focus ring on the DOM input; the glass-field edge is
    // the old site's focus affordance instead.
    outlineStyle: 'none',
  } as object,
});
