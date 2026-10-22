/** Shared UI primitives: every screen uses these so type, buttons and fields look the same everywhere. */
import React, { useEffect, useRef, useState, type ReactNode } from 'react';
import {
  ActivityIndicator, KeyboardAvoidingView, Platform, Pressable, ScrollView, StyleSheet, Text, TextInput, View, useWindowDimensions,
  type StyleProp, type TextInputProps, type TextProps, type TextStyle, type ViewStyle,
} from 'react-native';
import Reanimated, { interpolateColor, useAnimatedStyle, useSharedValue, withSpring } from 'react-native-reanimated';
import { SafeAreaView } from 'react-native-safe-area-context';

import Glass from './Glass';
import { Icone, LogoUSPapo, TuringWordmark, type NomeIcone } from './icons';
import { Pressionavel, Surgir, pulsar, type Movimento } from './Movimento';
import { alfa, paleta, useTheme } from '../theme';

/**
 * Titles, section labels (and buttons) are Changa; text is M PLUS 1p; details (addresses, versions,
 * tags) are Roboto Mono. Secondary text is the text color at a lower opacity, links take the accent.
 */
type VarianteTexto = 'titulo' | 'subtitulo' | 'secao' | 'corpo' | 'suave' | 'legenda' | 'detalhe' | 'link';

export function Texto({ v = 'corpo', cor, centro, style, ...props }: TextProps & {
  v?: VarianteTexto; cor?: string; centro?: boolean; style?: StyleProp<TextStyle>;
}) {
  const { colors, fonts, typography } = useTheme();
  // Web: a pressable text (a link) underlines under the mouse; react-native-web's Text takes mouse events.
  const [sobre, setSobre] = useState(false);
  const mouse = Platform.OS === 'web' && props.onPress ? { onMouseEnter: () => setSobre(true), onMouseLeave: () => setSobre(false) } : null;
  const base: Record<VarianteTexto, TextStyle> = {
    titulo: { fontFamily: fonts.title, ...typography['2xl'], color: colors.foreground },
    subtitulo: { fontFamily: fonts.title, ...typography.lg, color: colors.foreground },
    secao: { fontFamily: fonts.title, ...typography.xs, color: colors.mutedForeground, textTransform: 'uppercase', letterSpacing: 0.8 },
    corpo: { fontFamily: fonts.body, ...typography.base, color: colors.foreground },
    suave: { fontFamily: fonts.body, ...typography.sm, color: colors.mutedForeground },
    legenda: { fontFamily: fonts.body, ...typography.xs, color: colors.mutedForeground },
    detalhe: { fontFamily: fonts.mono, ...typography.xs, color: colors.mutedForeground },
    link: { fontFamily: fonts.body, ...typography.sm, color: colors.accent },
  };
  return (
    <Text {...props} {...mouse}
      style={[base[v], cor ? { color: cor } : null, centro && { textAlign: 'center' }, sobre && { textDecorationLine: 'underline' }, style]} />
  );
}

/**
 * A pressable's state. On the web, react-native-web adds `hovered` (the mouse is over it); Android
 * and iOS report only `pressed`.
 */
export type EstadoDoToque = { pressed: boolean; hovered?: boolean };

/** The tint behind a pressable row or icon: light under the mouse, stronger while pressed. */
export function tintaDoToque({ pressed, hovered }: EstadoDoToque, cor: string): string {
  return pressed ? alfa(cor, 0.1) : hovered ? alfa(cor, 0.06) : 'transparent';
}

/**
 * An icon button with the tint behind it. `ativo` keeps the accent tint (a chosen thumb); `rente`
 * lets the tint spill past the icon without moving anything (a close button beside a title). A new
 * icon (Copiar's check) or a thumb just chosen pops in.
 */
export function BotaoDeIcone({ icone, rotulo, onPress, cor, tamanho = 17, lado = 32, ativo, rente, desabilitado, animar = true }: {
  icone: NomeIcone; rotulo: string; onPress: () => void; cor?: string; tamanho?: number; lado?: number;
  ativo?: boolean; rente?: boolean; desabilitado?: boolean; animar?: boolean;
}) {
  const { colors, radius } = useTheme();
  const chave = `${icone}:${!!ativo}`;
  const [inicial] = useState({ chave, icone });
  const [mudou, setMudou] = useState(false);
  if (!mudou && chave !== inicial.chave) setMudou(true);
  return (
    <Pressable accessibilityRole="button" accessibilityLabel={rotulo} accessibilityState={{ selected: ativo, disabled: desabilitado }}
      onPress={onPress} disabled={desabilitado} hitSlop={4}
      style={(estado) => ({ width: lado, height: lado, alignItems: 'center', justifyContent: 'center', borderRadius: radius.md,
        margin: rente ? -(lado - tamanho) / 2 : 0, opacity: desabilitado ? 0.5 : 1,
        backgroundColor: ativo ? alfa(colors.accent, 0.14) : tintaDoToque(estado, colors.foreground) })}>
      {/* Plain until it first changes: a conversation has dozens of these. */}
      {mudou && animar ? (
        <Surgir key={chave} animar={!!ativo || icone !== inicial.icone} de={0.5}>
          <Icone nome={icone} cor={cor ?? (ativo ? colors.accent : colors.mutedForeground)} tamanho={tamanho} />
        </Surgir>
      ) : <Icone nome={icone} cor={cor ?? (ativo ? colors.accent : colors.mutedForeground)} tamanho={tamanho} />}
    </Pressable>
  );
}

/** An error or failure: the alert mark in the brand orange beside the text (the palette has no red). */
export function Erro({ children, centro, onPress }: { children: ReactNode; centro?: boolean; onPress?: () => void }) {
  const { colors, spacing } = useTheme();
  return (
    <View role="alert" style={{ flexDirection: 'row', alignItems: 'flex-start', gap: spacing.sm, alignSelf: centro ? 'center' : 'stretch', maxWidth: '100%' }}>
      <View style={{ paddingTop: 2 }}><Icone nome="alerta" cor={colors.brand} tamanho={16} traco={2} /></View>
      <Texto v="suave" cor={colors.foreground} onPress={onPress} style={{ flexShrink: 1, textAlign: centro ? 'center' : 'left' }}>{children}</Texto>
    </View>
  );
}

/** The USPapo brand: its orange mark and its name in Changa, in the accent (the manual's two primaries on light). */
export function Marca({ logo, fonte, coluna }: { logo: number; fonte: number; coluna?: boolean }) {
  const { colors, fonts, spacing } = useTheme();
  return (
    <View style={{ alignItems: 'center', flexDirection: coluna ? 'column' : 'row', gap: coluna ? spacing.xs : spacing.sm }}>
      <LogoUSPapo size={logo} />
      <Text style={{ fontFamily: fonts.title, fontSize: fonte, lineHeight: Math.round(fonte * 1.25), color: colors.accent }}>USPapo</Text>
    </View>
  );
}

/**
 * The USPapo mark on a widget (the right end of its footer, beside the data's source: in the chat,
 * full screen and in the saved PNG): the mark and the name, quiet. Screen readers skip it.
 */
export function MarcaDagua() {
  const { colors, fonts } = useTheme();
  return (
    <View importantForAccessibility="no-hide-descendants" accessibilityElementsHidden
      style={{ flexDirection: 'row', alignItems: 'center', gap: 5, alignSelf: 'flex-start' }}>
      <LogoUSPapo size={13} />
      <Text style={{ fontFamily: fonts.title, fontSize: 12, lineHeight: 16, color: colors.mutedForeground }}>USPapo</Text>
    </View>
  );
}

/** "Desenvolvido por" and the Turing imagotype (its colors on light, its white form on dark). */
export function Assinatura({ inicio }: { inicio?: boolean }) {
  const { escuro, spacing } = useTheme();
  return (
    <View accessibilityLabel="Desenvolvido pelo Turing USP"
      style={{ flexDirection: 'row', alignItems: 'center', justifyContent: inicio ? 'flex-start' : 'center', gap: spacing.sm }}>
      <Texto v="suave">Desenvolvido por</Texto>
      <TuringWordmark size={104} branco={escuro} />
    </View>
  );
}

type VarianteBotao = 'primario' | 'secundario';

/**
 * A pill button: orange with graphite text (primario) or glass (secundario), both with the glass
 * lift; pressed, it gives and springs back. Both variants are the same pressable with a different
 * fill, so a button that turns primario as it is pressed (a chosen theme) keeps its spring, and it
 * pops as it turns.
 */
export function Botao({ rotulo, onPress, v = 'primario', icone, carregando, desabilitado, compacto, style, accessibilityLabel }: {
  rotulo: string; onPress: () => void; v?: VarianteBotao; icone?: NomeIcone | ReactNode; carregando?: boolean;
  desabilitado?: boolean; compacto?: boolean; style?: StyleProp<ViewStyle>; accessibilityLabel?: string;
}) {
  const { colors, fonts, glass, radius, typography } = useTheme();
  const inativo = desabilitado || carregando;
  const primario = v === 'primario';
  const cor = primario ? colors.brandForeground : colors.foreground;
  const escala = useSharedValue(1);
  const [movimento] = useState<Movimento>(() => ({ escala }));
  const montado = useRef(false);
  useEffect(() => {
    if (montado.current && primario) pulsar(escala, 1.06);
    montado.current = true;
  }, [primario, escala]);
  const medidas: ViewStyle = {
    alignItems: 'center', justifyContent: 'center', flexDirection: 'row', gap: 8,
    minHeight: compacto ? 36 : 48, paddingHorizontal: compacto ? 14 : 20, borderRadius: radius.full,
  };
  const conteudo = carregando ? <ActivityIndicator color={cor} /> : (
    <>
      {typeof icone === 'string' ? <Icone nome={icone as NomeIcone} cor={cor} tamanho={compacto ? 16 : 18} /> : icone}
      <Text style={{ color: cor, fontFamily: fonts.title, ...(compacto ? typography.sm : typography.base) }}>{rotulo}</Text>
    </>
  );
  // The fill sits behind the content (zIndex -1 inside the button's own stacking context, for the web).
  const fundo = [StyleSheet.absoluteFill, { borderRadius: radius.full, zIndex: -1 }];
  return (
    <Pressionavel accessibilityRole="button" accessibilityLabel={accessibilityLabel ?? rotulo} accessibilityState={{ disabled: !!inativo }}
      onPress={onPress} disabled={inativo} desbotar={primario} aperto={compacto ? 0.94 : 0.96} opacidade={inativo ? 0.55 : 1}
      movimento={movimento} style={[medidas, glass.shadow, { zIndex: 0 }, style]}>
      {(estado: EstadoDoToque) => (
        <>
          {primario ? <View pointerEvents="none" style={[fundo, { backgroundColor: colors.brand }]} />
            : <Glass semSombra radius={radius.full} pointerEvents="none" style={fundo} />}
          {!primario && (estado.pressed || estado.hovered) ? (
            <View pointerEvents="none" style={[fundo, { backgroundColor: alfa(colors.foreground, estado.pressed ? 0.1 : 0.06) }]} />
          ) : null}
          {conteudo}
        </>
      )}
    </Pressionavel>
  );
}

/**
 * The ink of every text field: placeholder, and the caret, selection handles and selection in the
 * brand orange (Android would otherwise use the system's accent). Android paints `selectionColor`
 * opaque over the text, so there it is a tint; elsewhere it also colors the caret.
 */
export function useTintaDeCampo() {
  const { colors } = useTheme();
  return {
    placeholderTextColor: colors.mutedForeground,
    selectionColor: Platform.OS === 'android' ? alfa(colors.brand, 0.35) : colors.brand,
    cursorColor: colors.brand,
    selectionHandleColor: colors.brand,
  };
}

/** The ring a focused field shows: the brand orange on every edge. */
export const ANEL_DE_FOCO = 2;

/** The glass pill text field (focus lights the edge in the brand color). */
export function Campo({ icone, final, style, multiline, ...props }: TextInputProps & {
  icone?: NomeIcone; final?: ReactNode; style?: StyleProp<ViewStyle>;
}) {
  const { colors, fonts, radius, typography } = useTheme();
  const tinta = useTintaDeCampo();
  const [focado, setFocado] = useState(false);
  return (
    <Glass radius={multiline ? radius.lg : radius.full} borda={focado ? { borderColor: colors.brand, borderWidth: ANEL_DE_FOCO } : undefined}
      style={[{ alignItems: multiline ? 'flex-start' : 'center', flexDirection: 'row', gap: 12, minHeight: 52, paddingHorizontal: 18, paddingVertical: multiline ? 12 : 0 }, style as ViewStyle]}>
      {icone ? <Icone nome={icone} cor={colors.mutedForeground} /> : null}
      <TextInput
        {...tinta}
        multiline={multiline}
        {...props}
        onFocus={(e) => { setFocado(true); props.onFocus?.(e); }}
        onBlur={(e) => { setFocado(false); props.onBlur?.(e); }}
        // position: relative lifts the web <input> above the glass layers; outlineStyle drops the browser ring;
        // minWidth 0 lets it shrink below the width the browser derives from the font (icons stay visible).
        style={{ flex: 1, minWidth: 0, color: colors.foreground, fontFamily: fonts.body, fontSize: typography.base.fontSize, minHeight: multiline ? 66 : 48,
          textAlignVertical: multiline ? 'top' : 'center', position: 'relative', outlineStyle: 'none' } as object}
      />
      {final}
    </Glass>
  );
}

/** Content column: the old `.app-container` (or the narrower chat measure). */
export function Coluna({ children, chat, style, pointerEvents }: {
  children: ReactNode; chat?: boolean; style?: StyleProp<ViewStyle>; pointerEvents?: 'box-none' | 'auto';
}) {
  const { layout } = useTheme();
  const { width } = useWindowDimensions();
  return (
    <View pointerEvents={pointerEvents} style={[{ width: '100%', alignSelf: 'center', maxWidth: chat ? layout.chatMaxWidth : layout.containerMaxWidth,
      paddingHorizontal: layout.gutter(width) }, style]}>
      {children}
    </View>
  );
}

/** A row of a pop-up menu (the account menu, the conversation actions), with an optional icon. */
export function ItemDeMenu({ rotulo, icone, onPress }: { rotulo: string; icone?: NomeIcone; onPress: () => void }) {
  const { colors, radius, spacing } = useTheme();
  return (
    <Pressable accessibilityRole="button" onPress={onPress}
      style={(estado) => ({ flexDirection: 'row', alignItems: 'center', gap: spacing.md, minHeight: 44, paddingHorizontal: spacing.md,
        borderRadius: radius.md, backgroundColor: tintaDoToque(estado, colors.foreground) })}>
      {icone ? <Icone nome={icone} cor={colors.mutedForeground} tamanho={18} /> : null}
      <Texto v="suave" cor={colors.foreground}>{rotulo}</Texto>
    </Pressable>
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

/** The knob's travel: a 48pt track, 3pt of padding and a 22pt knob. */
const CURSO = 48 - 2 * 3 - 22;
/** The knob's spring: bubbly, but its bounce stays inside the track's padding. */
const MOLA_DO_BOTAO = { damping: 20, stiffness: 420, mass: 0.7 } as const;

/** The on/off pill with its label (settings toggles): orange when on, the text color at 25% when off; the knob springs across. */
export function Interruptor({ ligado, rotulo, onPress }: { ligado: boolean; rotulo: string; onPress: () => void }) {
  const { colors, radius, spacing } = useTheme();
  const posicao = useSharedValue(ligado ? 1 : 0);
  useEffect(() => {
    posicao.set(withSpring(ligado ? 1 : 0, MOLA_DO_BOTAO));
  }, [ligado, posicao]);
  const desligado = alfa(colors.foreground, 0.25);
  const trilho = useAnimatedStyle(() => ({
    backgroundColor: interpolateColor(Math.min(1, Math.max(0, posicao.value)), [0, 1], [desligado, colors.brand]),
  }), [desligado, colors.brand]);
  const botao = useAnimatedStyle(() => ({ transform: [{ translateX: posicao.value * CURSO }] }));
  return (
    // The tint spills past the row (negative margins), so the card's layout stays put.
    <Pressable accessibilityRole="switch" accessibilityState={{ checked: ligado }} onPress={onPress}
      style={(estado) => ({ flexDirection: 'row', alignItems: 'center', gap: spacing.md, margin: -spacing.sm, padding: spacing.sm,
        borderRadius: radius.md, backgroundColor: tintaDoToque(estado, colors.foreground) })}>
      <Reanimated.View style={[{ width: 48, height: 28, padding: 3, borderRadius: radius.full, justifyContent: 'center' }, trilho]}>
        <Reanimated.View style={[{ width: 22, height: 22, borderRadius: radius.full, backgroundColor: paleta.branco }, botao]} />
      </Reanimated.View>
      <Texto style={{ flex: 1 }}>{rotulo}</Texto>
    </Pressable>
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

/**
 * Centered, keyboard-aware single column for the auth screens (the old `max-w-md` card), between
 * the USPapo brand and the Turing signature, like the home.
 */
export function ColunaCentral({ children }: { children: ReactNode }) {
  const { spacing } = useTheme();
  return (
    <KeyboardAvoidingView style={{ flex: 1 }} behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
      <ScrollView keyboardShouldPersistTaps="handled"
        contentContainerStyle={{ flexGrow: 1, alignItems: 'center', justifyContent: 'center', padding: spacing.xl }}>
        <SafeAreaView style={{ width: '100%', maxWidth: 448, gap: spacing.lg }}>
          <View style={{ alignItems: 'center', marginBottom: spacing.sm }}><Marca logo={32} fonte={30} /></View>
          {children}
          <View style={{ marginTop: spacing.lg }}><Assinatura /></View>
        </SafeAreaView>
      </ScrollView>
    </KeyboardAvoidingView>
  );
}
