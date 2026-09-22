/** Shared UI primitives: every screen uses these so type, buttons and fields look the same everywhere. */
import React, { useState, type ReactNode } from 'react';
import {
  ActivityIndicator, KeyboardAvoidingView, Platform, Pressable, ScrollView, Text, TextInput, View, useWindowDimensions,
  type StyleProp, type TextInputProps, type TextProps, type TextStyle, type ViewStyle,
} from 'react-native';

import { SafeAreaView } from 'react-native-safe-area-context';

import Glass from './Glass';
import { Icone, type NomeIcone } from './icons';
import { useTheme } from '../theme';

type VarianteTexto = 'titulo' | 'subtitulo' | 'corpo' | 'secao' | 'suave' | 'legenda' | 'erro' | 'link';

export function Texto({ v = 'corpo', cor, centro, style, ...props }: TextProps & {
  v?: VarianteTexto; cor?: string; centro?: boolean; style?: StyleProp<TextStyle>;
}) {
  const { colors, fonts, typography } = useTheme();
  const base: Record<VarianteTexto, TextStyle> = {
    titulo: { fontFamily: fonts.displayBold, ...typography['2xl'], color: colors.foreground },
    subtitulo: { fontFamily: fonts.displayBold, ...typography.lg, color: colors.foreground },
    corpo: { fontFamily: fonts.body, ...typography.base, color: colors.foreground },
    secao: { fontFamily: fonts.bodyBold, ...typography.sm, color: colors.mutedForeground, textTransform: 'uppercase', letterSpacing: 0.6 },
    suave: { fontFamily: fonts.body, ...typography.sm, color: colors.mutedForeground },
    legenda: { fontFamily: fonts.body, ...typography.xs, color: colors.faintForeground },
    erro: { fontFamily: fonts.body, ...typography.sm, color: colors.danger },
    link: { fontFamily: fonts.body, ...typography.sm, color: colors.brand },
  };
  return <Text {...props} style={[base[v], cor ? { color: cor } : null, centro && { textAlign: 'center' }, style]} />;
}

type VarianteBotao = 'primario' | 'secundario' | 'perigo';

export function Botao({ rotulo, onPress, v = 'primario', icone, carregando, desabilitado, compacto, style, accessibilityLabel }: {
  rotulo: string; onPress: () => void; v?: VarianteBotao; icone?: NomeIcone | ReactNode; carregando?: boolean;
  desabilitado?: boolean; compacto?: boolean; style?: StyleProp<ViewStyle>; accessibilityLabel?: string;
}) {
  const { colors, fonts, glass, radius, typography } = useTheme();
  const inativo = desabilitado || carregando;
  const cor = v === 'primario' ? colors.brandForeground : v === 'perigo' ? colors.danger : colors.foreground;
  const medidas: ViewStyle = {
    alignItems: 'center', justifyContent: 'center', flexDirection: 'row', gap: 8,
    minHeight: compacto ? 36 : 48, paddingHorizontal: compacto ? 14 : 20, borderRadius: radius.full,
  };
  const conteudo = carregando ? <ActivityIndicator color={cor} /> : (
    <>
      {typeof icone === 'string' ? <Icone nome={icone as NomeIcone} cor={cor} tamanho={compacto ? 16 : 18} /> : icone}
      <Text style={{ color: cor, fontFamily: fonts.bodyBold, fontSize: compacto ? typography.sm.fontSize : typography.base.fontSize }}>
        {rotulo}
      </Text>
    </>
  );
  const a11y = { accessibilityRole: 'button' as const, accessibilityLabel: accessibilityLabel ?? rotulo, accessibilityState: { disabled: !!inativo } };
  if (v === 'primario') {
    return (
      <Pressable {...a11y} onPress={onPress} disabled={inativo}
        style={({ pressed }) => [medidas, glass.shadow, { backgroundColor: colors.brand, opacity: inativo ? 0.55 : pressed ? 0.85 : 1 }, style]}>
        {conteudo}
      </Pressable>
    );
  }
  return (
    <Glass onPress={inativo ? undefined : onPress} semSombra accessibilityLabel={a11y.accessibilityLabel}
      borda={v === 'perigo' ? { borderColor: colors.danger } : undefined}
      style={[medidas, { opacity: inativo ? 0.55 : 1 }, style as ViewStyle]}>
      {conteudo}
    </Glass>
  );
}

/** The glass pill text field (focus lights the edge in the brand color). */
export function Campo({ icone, final, style, multiline, ...props }: TextInputProps & {
  icone?: NomeIcone; final?: ReactNode; style?: StyleProp<ViewStyle>;
}) {
  const { colors, fonts, radius, typography } = useTheme();
  const [focado, setFocado] = useState(false);
  return (
    <Glass radius={multiline ? radius.lg : radius.full} borda={focado ? { borderColor: colors.brand, borderWidth: 2 } : undefined}
      style={[{ alignItems: multiline ? 'flex-start' : 'center', flexDirection: 'row', gap: 12, minHeight: 52, paddingHorizontal: 18, paddingVertical: multiline ? 12 : 0 }, style as ViewStyle]}>
      {icone ? <Icone nome={icone} cor={colors.mutedForeground} /> : null}
      <TextInput
        placeholderTextColor={colors.faintForeground}
        selectionColor={colors.brand}
        multiline={multiline}
        {...props}
        onFocus={(e) => { setFocado(true); props.onFocus?.(e); }}
        onBlur={(e) => { setFocado(false); props.onBlur?.(e); }}
        // position: relative lifts the web <input> above the glass layers; outlineStyle drops the browser ring.
        style={{ flex: 1, color: colors.foreground, fontFamily: fonts.body, fontSize: typography.base.fontSize, minHeight: multiline ? 66 : 48,
          textAlignVertical: multiline ? 'top' : 'center', position: 'relative', outlineStyle: 'none' } as object}
      />
      {final}
    </Glass>
  );
}

/** Content column: the old `.app-container` (or the narrower chat measure). */
export function Coluna({ children, chat, style }: { children: ReactNode; chat?: boolean; style?: StyleProp<ViewStyle> }) {
  const { layout } = useTheme();
  const { width } = useWindowDimensions();
  return (
    <View style={[{ width: '100%', alignSelf: 'center', maxWidth: chat ? layout.chatMaxWidth : layout.containerMaxWidth,
      paddingHorizontal: layout.gutter(width) }, style]}>
      {children}
    </View>
  );
}

/** A glass card with an optional section title (settings, admin panels). */
export function Cartao({ titulo, children, style }: { titulo?: string; children: ReactNode; style?: StyleProp<ViewStyle> }) {
  const { radius, spacing } = useTheme();
  return (
    <Glass radius={radius.lg} style={[{ gap: spacing.md, padding: spacing.lg }, style as ViewStyle]}>
      {titulo ? <Texto v="secao">{titulo}</Texto> : null}
      {children}
    </Glass>
  );
}

/** Centered message with an optional action (empty, error and not-found states). */
export function Estado({ titulo, mensagem, acao, aoAgir }: { titulo?: string; mensagem: string; acao?: string; aoAgir?: () => void }) {
  const { spacing } = useTheme();
  return (
    <View style={{ alignItems: 'center', gap: spacing.sm, padding: spacing.xl }}>
      {titulo ? <Texto v="subtitulo" centro>{titulo}</Texto> : null}
      <Texto v="suave" centro>{mensagem}</Texto>
      {acao && aoAgir ? <Botao v="secundario" compacto rotulo={acao} onPress={aoAgir} style={{ marginTop: spacing.sm }} /> : null}
    </View>
  );
}

/** Centered, keyboard-aware single column for the auth screens (the old `max-w-md` card). */
export function ColunaCentral({ children }: { children: ReactNode }) {
  const { spacing } = useTheme();
  return (
    <KeyboardAvoidingView style={{ flex: 1 }} behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
      <ScrollView keyboardShouldPersistTaps="handled"
        contentContainerStyle={{ flexGrow: 1, alignItems: 'center', justifyContent: 'center', padding: spacing.xl }}>
        <SafeAreaView style={{ width: '100%', maxWidth: 448, gap: spacing.lg }}>{children}</SafeAreaView>
      </ScrollView>
    </KeyboardAvoidingView>
  );
}
