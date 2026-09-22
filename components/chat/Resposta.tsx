/**
 * The assistant answer: markdown revealed at a steady pace while streaming.
 *
 * The text is split into blocks (blank-line separated, fences kept whole) and
 * each block is a memoized renderer with a stable key: finished blocks never
 * re-parse, and every new block fades and rises in — the streaming animation.
 * A finished answer with formulas renders through KaTeX (components/chat/Matematica).
 */
import { MarkdownStream, type MarkdownStyleMap, type RenderRules } from '@ronradtke/react-native-markdown-display';
import React, { memo, useEffect, useMemo, useRef, useState } from 'react';
import { Animated, Easing, Linking, Platform, Text } from 'react-native';

import { Matematica } from './Matematica';
import { blocos, selar, temMatematica } from '../../lib/markdown';
import { useTheme, type Theme } from '../../theme';

/** Characters on screen now: chases the received text ~0.25 s behind, never slower than 30 chars/s. */
export function useRevelacao(texto: string, streaming: boolean): string {
  const [revelado, setRevelado] = useState(() => (streaming ? 0 : texto.length));
  const pos = useRef(revelado);
  const alvo = useRef(texto);
  const ativo = useRef(streaming);
  useEffect(() => {
    alvo.current = texto;
    ativo.current = streaming;
    if (!streaming && pos.current >= texto.length) {
      pos.current = texto.length;
      setRevelado(texto.length);
      return;
    }
    let quadro = 0;
    let antes = Date.now();
    let render = 0;
    const passo = () => {
      const agora = Date.now();
      const restante = alvo.current.length - pos.current;
      const velocidade = Math.max(30, restante / (ativo.current ? 0.25 : 0.08));
      pos.current = Math.min(alvo.current.length, pos.current + (velocidade * (agora - antes)) / 1000);
      antes = agora;
      if (agora - render >= 50) {
        render = agora;
        setRevelado(Math.floor(pos.current));
      }
      if (ativo.current || pos.current < alvo.current.length) quadro = requestAnimationFrame(passo);
      else setRevelado(alvo.current.length);
    };
    quadro = requestAnimationFrame(passo);
    return () => cancelAnimationFrame(quadro);
  }, [texto, streaming]);
  return texto.slice(0, revelado);
}

const MONO = Platform.select({ ios: 'Courier New', default: 'monospace' });

function estilos({ colors, fonts, radius, spacing, typography, scheme }: Theme): MarkdownStyleMap {
  const corpo = { color: colors.foreground, fontFamily: fonts.body, ...typography.lg };
  const tinta = scheme === 'dark' ? 'rgba(255,255,255,0.08)' : 'rgba(11,16,48,0.06)';
  const linha = scheme === 'dark' ? 'rgba(255,255,255,0.14)' : 'rgba(11,16,48,0.14)';
  const titulo = (passo: keyof typeof typography, fonte: string = fonts.displayBold, cor = colors.foreground) => ({
    flexDirection: 'row' as const, flexWrap: 'wrap' as const, color: cor, fontFamily: fonte, ...typography[passo], marginTop: spacing.md, marginBottom: spacing.xs,
  });
  const codigo = { backgroundColor: tinta, borderColor: linha, borderRadius: radius.md, borderWidth: 1, color: colors.foreground,
    fontFamily: MONO, fontSize: typography.sm.fontSize, marginBottom: spacing.md, padding: spacing.md };
  return {
    body: corpo, text: corpo, textgroup: corpo,
    paragraph: { marginTop: 0, marginBottom: spacing.md, flexWrap: 'wrap', flexDirection: 'row', width: '100%' },
    heading1: titulo('2xl'), heading2: titulo('xl'), heading3: titulo('lg'),
    heading4: titulo('base', fonts.bodyBold), heading5: titulo('sm', fonts.bodyBold, colors.mutedForeground), heading6: titulo('xs', fonts.bodyBold, colors.mutedForeground),
    strong: { fontFamily: fonts.bodyBold, color: colors.foreground },
    em: { fontStyle: 'italic', color: colors.mutedForeground },
    s: { textDecorationLine: 'line-through' },
    link: { color: colors.brand, textDecorationLine: 'underline' },
    hr: { backgroundColor: linha, height: 1, marginVertical: spacing.lg },
    blockquote: { backgroundColor: 'transparent', borderLeftColor: colors.brand, borderLeftWidth: 2, marginLeft: 0, paddingLeft: spacing.md, marginBottom: spacing.md },
    bullet_list: { marginBottom: spacing.md }, ordered_list: { marginBottom: spacing.md },
    list_item: { flexDirection: 'row', marginBottom: spacing.xs },
    bullet_list_icon: { color: colors.brand, ...typography.lg, marginLeft: 0, marginRight: spacing.sm },
    ordered_list_icon: { ...corpo, color: colors.mutedForeground, marginLeft: 0, marginRight: spacing.sm },
    bullet_list_content: { flex: 1 }, ordered_list_content: { flex: 1 },
    code_inline: { backgroundColor: tinta, borderRadius: radius.sm, borderWidth: 0, color: colors.foreground, fontFamily: MONO, fontSize: typography.sm.fontSize, paddingHorizontal: 5 },
    code_block: codigo, fence: codigo,
    table: { borderColor: linha, borderRadius: radius.md, borderWidth: 1, marginBottom: spacing.md },
    thead: { backgroundColor: tinta },
    tr: { borderBottomWidth: 1, borderColor: linha, flexDirection: 'row' },
    th: { flex: 1, padding: spacing.sm, color: colors.foreground, fontFamily: fonts.bodyBold, fontSize: typography.sm.fontSize },
    td: { flex: 1, padding: spacing.sm, color: colors.mutedForeground, fontFamily: fonts.body, fontSize: typography.sm.fontSize },
  };
}

// Plain code blocks (the default fence pulls in a highlighter and an icon font); no remote images.
const regras: RenderRules = {
  image: () => null,
  fence: (node, _c, _p, styles) => <Text key={node.key} style={styles.fence}>{node.content.replace(/\n$/, '')}</Text>,
  code_block: (node, _c, _p, styles) => <Text key={node.key} style={styles.code_block}>{node.content.replace(/\n$/, '')}</Text>,
};

/** Only web and mail links open: a model-written `javascript:` link must never run. */
const abrirLink = (url: string) => {
  if (/^(https?:|mailto:)/i.test(url)) void Linking.openURL(url).catch(() => undefined);
  return false;
};

const Bloco = memo(function Bloco({ texto, streaming, animar, tema, estilo }: {
  texto: string; streaming: boolean; animar: boolean; tema: Theme; estilo: MarkdownStyleMap;
}) {
  const [entrada] = useState(() => new Animated.Value(animar ? 0 : 1));
  useEffect(() => {
    if (animar) Animated.timing(entrada, { toValue: 1, duration: 280, easing: Easing.out(Easing.cubic), useNativeDriver: true }).start();
  }, [animar, entrada]);
  const translateY = entrada.interpolate({ inputRange: [0, 1], outputRange: [6, 0] });
  return (
    <Animated.View style={{ opacity: entrada, transform: [{ translateY }] }}>
      <MarkdownStream colorScheme={tema.scheme} cursorColor={tema.colors.brand} cursorStyle={{ height: 18, width: 2, borderRadius: 1 }}
        mergeStyle={false} onLinkPress={abrirLink} rules={regras} streaming={streaming} style={estilo}>
        {streaming ? selar(texto) : texto}
      </MarkdownStream>
    </Animated.View>
  );
});

export default function Resposta({ texto, streaming }: { texto: string; streaming: boolean }) {
  const tema = useTheme();
  const visivel = useRevelacao(texto, streaming);
  const estilo = useMemo(() => estilos(tema), [tema]);
  const [animar] = useState(streaming); // saved answers open without animation
  const escrevendo = streaming || visivel.length < texto.length;

  if (!escrevendo && temMatematica(texto)) return <Matematica texto={texto} />;
  const partes = blocos(visivel);
  return (
    <>
      {partes.map((parte, i) => (
        <Bloco key={i} texto={parte} streaming={escrevendo && i === partes.length - 1} animar={animar} tema={tema} estilo={estilo} />
      ))}
    </>
  );
}
