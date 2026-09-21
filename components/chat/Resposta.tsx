/**
 * The assistant answer: markdown, revealed at a steady pace.
 *
 * Two things used to be missing here and both were the same omission — the
 * answer was printed as one flat `<Text>`:
 *
 * 1. MARKDOWN. The model writes headings, lists, tables, bold and code, and
 *    the old site rendered all of it (`site/components/chatResponse.tsx`
 *    over react-markdown + remark-gfm). On React Native the equivalent is
 *    `@ronradtke/react-native-markdown-display`, already a dependency of
 *    this project; its `MarkdownStream` also SEALS an unterminated fence
 *    mid-stream, so a half-written ``` block does not flip the whole answer
 *    into a code block for a few frames.
 *
 * 2. THE STREAM. `lib/api` yields deltas, but a delta is whatever the
 *    provider flushed — a word, or three sentences at once. Printing them
 *    raw reads as jumping text, not as writing. `useRevelacao` is the port
 *    of the old site's reveal: a cursor that CHASES the received text,
 *    aiming to stay ~0.25 s behind it and never slower than 30 chars/s, so
 *    the answer appears at a readable, even pace whatever the provider
 *    does. When the stream ends it drains what is left and stops.
 *
 * Math: LaTeX still goes through components/chat/Matematica (KaTeX in a
 * WebView) when the turn is COMPLETE and the optional `react-native-webview`
 * package is installed. Otherwise — and always while streaming — the
 * markdown path renders the text, so an answer with a formula is at least
 * still an answer with headings and lists.
 */
import React, { useEffect, useMemo, useRef, useState } from 'react';
import { Linking, Platform, StyleSheet, Text, View } from 'react-native';
import {
  MarkdownStream,
  type ASTNode,
  type MarkdownStyleMap,
  type RenderRules,
} from '@ronradtke/react-native-markdown-display';

import { fonts, useTheme, type Theme } from '../../theme';
import { Matematica, suportaKaTeX, temDelimitadorMatematico } from './Matematica';

// ─────────────────────────────────────────────
// The reveal pacer (port of the old site's useRevelacao)
// ─────────────────────────────────────────────

/** How far behind the received text the reveal aims to stay, in seconds. */
const ATRASO_ALVO = 0.25;
/** Floor, in characters per second: a trickle still reads as writing. */
const VELOCIDADE_MINIMA = 30;
/** Minimum gap between re-renders (the markdown is re-parsed on each one). */
const INTERVALO_RENDER = 60;

/**
 * The slice of `texto` that should be on screen right now.
 *
 * While `streaming`, the cursor advances every frame at `restante /
 * ATRASO_ALVO` characters per second (never below the floor), which makes it
 * catch up on a big delta and slow down on a trickle. When the stream stops
 * it drains the rest at three times that pace and settles on the full text —
 * so an answer that was already complete when the screen opened is never
 * animated.
 */
export function useRevelacao(texto: string, streaming: boolean): string {
  const [revelado, setRevelado] = useState(() => (streaming ? 0 : texto.length));
  const posicao = useRef(revelado);
  const alvo = useRef(texto);
  const ativo = useRef(streaming);

  useEffect(() => {
    alvo.current = texto;
    ativo.current = streaming;

    // Nothing to animate: a saved conversation opens fully written.
    if (!streaming && posicao.current >= texto.length) {
      if (posicao.current !== texto.length) {
        posicao.current = texto.length;
        setRevelado(texto.length);
      }
      return;
    }

    let quadro = 0;
    let anterior = Date.now();
    let ultimoRender = 0;

    const passo = () => {
      const agora = Date.now();
      const decorrido = (agora - anterior) / 1000;
      anterior = agora;

      const restante = alvo.current.length - posicao.current;
      const atraso = ativo.current ? ATRASO_ALVO : ATRASO_ALVO / 3;
      const velocidade = Math.max(VELOCIDADE_MINIMA, restante / atraso);
      posicao.current = Math.min(
        alvo.current.length,
        posicao.current + velocidade * decorrido,
      );

      if (agora - ultimoRender >= INTERVALO_RENDER) {
        ultimoRender = agora;
        setRevelado(Math.floor(posicao.current));
      }

      if (ativo.current || posicao.current < alvo.current.length) {
        quadro = requestAnimationFrame(passo);
        return;
      }
      setRevelado(alvo.current.length);
    };

    quadro = requestAnimationFrame(passo);
    return () => cancelAnimationFrame(quadro);
  }, [texto, streaming]);

  return texto.slice(0, Math.min(revelado, texto.length));
}

// ─────────────────────────────────────────────
// Markdown styling (the old site's COMPONENTES map, in RN terms)
// ─────────────────────────────────────────────

const MONO = Platform.select({
  ios: 'Courier New',
  android: 'monospace',
  default: 'monospace',
});

/**
 * The style map handed to the renderer. Built from the theme so light and
 * dark both read, and deliberately close to the old site's classes: body
 * copy at the `text-lg` step with relaxed leading, headings in the display
 * face, lists tight, code on a faint tint, tables with hairline rules.
 */
function estilosDeMarkdown(tema: Theme): MarkdownStyleMap {
  const { colors, radius, spacing, typography } = tema;
  const corpo = {
    color: colors.foreground,
    fontFamily: fonts.body,
    fontSize: typography.lg.fontSize,
    lineHeight: typography.lg.lineHeight,
  };
  const tinta = tema.scheme === 'dark' ? 'rgba(255,255,255,0.08)' : 'rgba(11,16,48,0.06)';
  const linha = tema.scheme === 'dark' ? 'rgba(255,255,255,0.14)' : 'rgba(11,16,48,0.14)';
  return {
    body: corpo,
    text: corpo,
    textgroup: corpo,
    paragraph: {
      marginTop: 0,
      marginBottom: spacing.md,
      flexWrap: 'wrap' as const,
      flexDirection: 'row' as const,
      alignItems: 'flex-start' as const,
      justifyContent: 'flex-start' as const,
      width: '100%' as const,
    },
    heading1: {
      // The rule renders a View around the text run (renderRules.heading*):
      // without the row direction each word lands on its own line.
      flexDirection: 'row' as const,
      flexWrap: 'wrap' as const,
      color: colors.foreground,
      fontFamily: fonts.displayBold,
      fontSize: typography['2xl'].fontSize,
      lineHeight: typography['2xl'].lineHeight,
      marginTop: spacing.lg,
      marginBottom: spacing.sm,
    },
    heading2: {
      // The rule renders a View around the text run (renderRules.heading*):
      // without the row direction each word lands on its own line.
      flexDirection: 'row' as const,
      flexWrap: 'wrap' as const,
      color: colors.foreground,
      fontFamily: fonts.displayBold,
      fontSize: typography.xl.fontSize,
      lineHeight: typography.xl.lineHeight,
      marginTop: spacing.lg,
      marginBottom: spacing.sm,
    },
    heading3: {
      // The rule renders a View around the text run (renderRules.heading*):
      // without the row direction each word lands on its own line.
      flexDirection: 'row' as const,
      flexWrap: 'wrap' as const,
      color: colors.foreground,
      fontFamily: fonts.displayBold,
      fontSize: typography.lg.fontSize,
      lineHeight: typography.lg.lineHeight,
      marginTop: spacing.md,
      marginBottom: spacing.xs,
    },
    heading4: {
      // The rule renders a View around the text run (renderRules.heading*):
      // without the row direction each word lands on its own line.
      flexDirection: 'row' as const,
      flexWrap: 'wrap' as const,
      color: colors.foreground,
      fontFamily: fonts.bodyBold,
      fontSize: typography.base.fontSize,
      marginTop: spacing.md,
      marginBottom: spacing.xs,
    },
    heading5: {
      // The rule renders a View around the text run (renderRules.heading*):
      // without the row direction each word lands on its own line.
      flexDirection: 'row' as const,
      flexWrap: 'wrap' as const,
      color: colors.mutedForeground,
      fontFamily: fonts.bodyBold,
      fontSize: typography.sm.fontSize,
      marginTop: spacing.sm,
    },
    heading6: {
      // The rule renders a View around the text run (renderRules.heading*):
      // without the row direction each word lands on its own line.
      flexDirection: 'row' as const,
      flexWrap: 'wrap' as const,
      color: colors.mutedForeground,
      fontFamily: fonts.bodyBold,
      fontSize: typography.xs.fontSize,
      marginTop: spacing.sm,
    },
    strong: { fontFamily: fonts.bodyBold, color: colors.foreground },
    em: { fontStyle: 'italic' as const, color: colors.mutedForeground },
    s: { textDecorationLine: 'line-through' as const },
    link: { color: colors.brand, textDecorationLine: 'underline' as const },
    blocklink: { borderColor: colors.brand },
    hr: { backgroundColor: linha, height: 1, marginVertical: spacing.lg },
    blockquote: {
      backgroundColor: 'transparent',
      borderLeftColor: colors.brand,
      borderLeftWidth: 2,
      marginLeft: 0,
      paddingLeft: spacing.md,
      marginBottom: spacing.md,
    },
    bullet_list: { marginBottom: spacing.md },
    ordered_list: { marginBottom: spacing.md },
    list_item: { flexDirection: 'row' as const, marginBottom: spacing.xs },
    bullet_list_icon: {
      color: colors.brand,
      fontSize: typography.lg.fontSize,
      lineHeight: typography.lg.lineHeight,
      marginLeft: 0,
      marginRight: spacing.sm,
    },
    ordered_list_icon: {
      ...corpo,
      color: colors.mutedForeground,
      marginLeft: 0,
      marginRight: spacing.sm,
    },
    bullet_list_content: { flex: 1 },
    ordered_list_content: { flex: 1 },
    code_inline: {
      backgroundColor: tinta,
      borderRadius: radius.sm,
      borderWidth: 0,
      color: colors.foreground,
      fontFamily: MONO,
      fontSize: typography.sm.fontSize,
      paddingHorizontal: 5,
      paddingVertical: 1,
    },
    code_block: {
      backgroundColor: tinta,
      borderColor: linha,
      borderRadius: radius.md,
      borderWidth: 1,
      color: colors.foreground,
      fontFamily: MONO,
      fontSize: typography.sm.fontSize,
      marginBottom: spacing.md,
      padding: spacing.md,
    },
    fence: {
      backgroundColor: tinta,
      borderColor: linha,
      borderRadius: radius.md,
      borderWidth: 1,
      color: colors.foreground,
      fontFamily: MONO,
      fontSize: typography.sm.fontSize,
      marginBottom: spacing.md,
      padding: spacing.md,
    },
    table: {
      borderColor: linha,
      borderRadius: radius.md,
      borderWidth: 1,
      marginBottom: spacing.md,
    },
    thead: { backgroundColor: tinta },
    tr: { borderBottomWidth: 1, borderColor: linha, flexDirection: 'row' as const },
    th: {
      flex: 1,
      padding: spacing.sm,
      color: colors.foreground,
      fontFamily: fonts.bodyBold,
      fontSize: typography.sm.fontSize,
    },
    td: {
      flex: 1,
      padding: spacing.sm,
      color: colors.mutedForeground,
      fontFamily: fonts.body,
      fontSize: typography.sm.fontSize,
    },
  };
}

/**
 * Rules the library's defaults get wrong for this app.
 *
 * `fence` and `code_block` are replaced with a plain <Text> block: the
 * built-in fence renders a header bar with a syntax highlighter and an icon
 * font (prism + @react-native-vector-icons), which is a lot of machinery and
 * a native font dependency for what an answer about the bandejão needs.
 */
function regrasDeMarkdown(cor: string): RenderRules {
  const bloco = (
    node: ASTNode,
    _children: unknown,
    _parent: unknown,
    styles: MarkdownStyleMap,
  ) => (
    <Text key={node.key} style={[styles.fence, { color: cor }]}>
      {node.content.replace(/\n$/, '')}
    </Text>
  );
  return { fence: bloco, code_block: bloco };
}

/** Opens links in the system browser; a failure is not worth a crash. */
function abrirLink(url: string): boolean {
  void Linking.openURL(url).catch(() => undefined);
  return false;
}

// ─────────────────────────────────────────────
// The component
// ─────────────────────────────────────────────

export type RespostaProps = {
  /** The answer text, as received so far. */
  texto: string;
  /** True while the stream is still running (drives the reveal + caret). */
  streaming: boolean;
};

export function Resposta({ texto, streaming }: RespostaProps) {
  const tema = useTheme();
  const visivel = useRevelacao(texto, streaming);
  const estilos = useMemo(() => estilosDeMarkdown(tema), [tema]);
  const regras = useMemo(() => regrasDeMarkdown(tema.colors.foreground), [tema]);

  // The reveal is still behind the received text, so the caret belongs on
  // screen even after the network has finished.
  const escrevendo = streaming || visivel.length < texto.length;

  // KaTeX only makes sense on the final text, and only where the optional
  // WebView package exists; everywhere else markdown is the renderer.
  if (!escrevendo && suportaKaTeX() && temDelimitadorMatematico(texto)) {
    return <Matematica texto={texto} pronto />;
  }

  if (visivel === '') {
    // Nothing revealed yet: an empty <View> keeps the list layout stable
    // instead of collapsing and re-expanding on the first character.
    return <View style={styles.vazio} />;
  }

  return (
    <MarkdownStream
      colorScheme={tema.scheme}
      cursorColor={tema.colors.brand}
      cursorStyle={styles.caret}
      mergeStyle={false}
      onLinkPress={abrirLink}
      rules={regras}
      streaming={escrevendo}
      style={estilos}
    >
      {visivel}
    </MarkdownStream>
  );
}

const styles = StyleSheet.create({
  vazio: { height: 0 },
  caret: { height: 18, width: 2, marginTop: 2, borderRadius: 1 },
});

export default Resposta;
