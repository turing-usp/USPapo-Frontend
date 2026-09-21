/**
 * The glass pill input — the old site's `.glass.glass-field.rounded-full`.
 *
 * Every auth screen uses this one component. They used to each build the pill
 * inline, and drifted: login spread `glass.hairline` (a white filament at 38%
 * over 7% sides) while register and reset used `colors.line` raw — and `line`
 * is a *base* colour meant to be taken with an opacity, so in the dark scheme
 * it resolved to solid `#ffffff` and drew a hard white ring.
 *
 * Focus reproduces `.glass-field:has(:focus-visible)`: the edge becomes the
 * brand orange and thickens to 2px.
 */
import React, { type ReactNode } from 'react';
import {
  TextInput,
  View,
  type TextInputProps,
  type ViewStyle,
} from 'react-native';

import Glass from './Glass';
import { fonts, useTheme } from '../theme';

export type CampoVidroProps = {
  /** Brand-coloured focus ring (old `.glass-field:has(:focus-visible)`). */
  focado: boolean;
  aoFocar: () => void;
  aoPerderFoco: () => void;
  /** Adornment rendered inside the pill, on the left. */
  icone?: ReactNode;
  /** Trailing control (the password eye toggle). */
  botaoFinal?: ReactNode;
  style?: ViewStyle;
} & Omit<TextInputProps, 'style' | 'onFocus' | 'onBlur'>;

export default function CampoVidro({
  focado,
  aoFocar,
  aoPerderFoco,
  icone,
  botaoFinal,
  style,
  ...resto
}: CampoVidroProps) {
  const { colors, radius, typography } = useTheme();
  return (
    <Glass
      radius={radius.full}
      borda={focado ? { borderColor: colors.brand, borderWidth: 2 } : undefined}
      style={[
        {
          alignItems: 'center',
          flexDirection: 'row',
          minHeight: 52,
          paddingHorizontal: 18,
          paddingVertical: 14,
        },
        style ?? {},
      ]}
    >
      {icone ? <View pointerEvents="none">{icone}</View> : null}
      <TextInput
        {...resto}
        onBlur={aoPerderFoco}
        onFocus={aoFocar}
        placeholderTextColor={resto.placeholderTextColor ?? colors.mutedForeground}
        selectionColor={colors.brand}
        style={{
          color: colors.foreground,
          flex: 1,
          fontFamily: fonts.body,
          fontSize: typography.base.fontSize,
          marginStart: icone ? 12 : 0,
          // Load-bearing on web, inert on native (relative is the RN
          // default): a react-native-web TextInput is a bare DOM input with
          // no `position`, so it is a STATIC box and paints under the
          // glass pane's absolutely positioned layers — the typed text
          // simply did not show. See components/Glass.
          position: 'relative',
          // RN Web draws its own focus ring on the DOM input; the glass edge
          // is the old site's focus affordance instead.
          outlineStyle: 'none',
        } as object}
      />
      {botaoFinal ?? null}
    </Glass>
  );
}
