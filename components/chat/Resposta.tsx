/**
 * The assistant answer: markdown revealed at a steady pace while streaming.
 *
 * The text is split into blocks (blank-line separated, fences kept whole) and
 * each block is a memoized renderer with a stable key: finished blocks never
 * re-parse, and every new block fades and rises in — the streaming animation.
 * A finished answer with formulas renders through KaTeX (components/chat/Matematica).
 * Tables size each column to its content and scroll sideways when they cannot fit.
 */
import {
  createMarkdownIt, MarkdownStream, type ASTNode, type MarkdownStyleMap, type RenderRules,
} from '@ronradtke/react-native-markdown-display';
import React, { createContext, memo, useContext, useEffect, useMemo, useRef, useState, type ReactNode } from 'react';
import { Animated, Easing, Linking, Platform, ScrollView, Text, View, useWindowDimensions, type ViewStyle } from 'react-native';

import { Matematica } from './Matematica';
import { blocos, distribuirColunas, medirColunas, quebras, selar, temMatematica, tintasDaTabela } from '../../lib/markdown';
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
const analisador = createMarkdownIt({ plugins: [quebras] });

function estilos({ colors, fonts, radius, spacing, typography, escuro }: Theme): MarkdownStyleMap {
  // Leaves take the nearest styled ancestor's text style (body, strong, heading, cell): `text` and
  // `textgroup` stay empty, or they would override bold, headings and table cells with the body style.
  const corpo = { color: colors.foreground, fontFamily: fonts.body, ...typography.lg };
  const { linha, cabecalho: tinta, listra } = tintasDaTabela(escuro);
  const celula = { paddingHorizontal: spacing.md, paddingVertical: spacing.sm, ...typography.sm, color: colors.foreground };
  const titulo = (passo: keyof typeof typography, fonte: string = fonts.displayBold, cor = colors.foreground) => ({
    flexDirection: 'row' as const, flexWrap: 'wrap' as const, color: cor, fontFamily: fonte, ...typography[passo], marginTop: spacing.md, marginBottom: spacing.xs,
  });
  const codigo = { backgroundColor: tinta, borderColor: linha, borderRadius: radius.md, borderWidth: 1, color: colors.foreground,
    fontFamily: MONO, fontSize: typography.sm.fontSize, marginBottom: spacing.md, padding: spacing.md };
  return {
    body: corpo, text: {}, textgroup: {},
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
    table: { borderColor: linha, borderRadius: radius.md, borderWidth: 1, marginBottom: spacing.md, overflow: 'hidden' },
    thead: { backgroundColor: tinta },
    tr: { borderColor: linha, flexDirection: 'row' },
    tr_divisa: { borderBottomWidth: 1 },
    tr_listra: { backgroundColor: listra },
    th: { ...celula, fontFamily: fonts.bodyBold },
    td: { ...celula, fontFamily: fonts.body },
    celula_divisa: { borderLeftWidth: 1, borderColor: linha },
  };
}

/** Column widths of the table being rendered, read by its cells. */
const Larguras = createContext<number[]>([]);

function textoDe(no: ASTNode): string {
  if (no.type === 'hardbreak' || no.type === 'softbreak') return '\n';
  if (no.type === 'text' || no.type === 'code_inline') return no.content;
  return no.children.map(textoDe).join('');
}

/** Markdown sets column alignment as an inline `text-align` style on each cell. */
const ALINHAR: Record<string, ViewStyle['alignItems']> = { center: 'center', right: 'flex-end' };

function Tabela({ no, estilo, children }: { no: ASTNode; estilo: MarkdownStyleMap; children: ReactNode }) {
  const { layout, spacing, typography } = useTheme();
  const { width } = useWindowDimensions();
  const [disponivel, setDisponivel] = useState(() => Math.min(width, layout.chatMaxWidth) - 2 * spacing.lg - 2);
  const linhas = no.children.flatMap((secao) => secao.children.map((tr) => tr.children.map(textoDe)));
  const { larguras, rola } = distribuirColunas(medirColunas(linhas), disponivel, {
    caractere: typography.sm.fontSize * 0.56, folga: 2 * spacing.md + 1, minimo: 56, maximo: 280, conforto: 120,
  });
  return (
    <View style={estilo._VIEW_SAFE_table} onLayout={(e) => setDisponivel(Math.floor(e.nativeEvent.layout.width) - 2)}>
      <ScrollView horizontal scrollEnabled={rola} showsHorizontalScrollIndicator={rola} nestedScrollEnabled bounces={false}>
        <Larguras.Provider value={larguras}>
          <View style={{ width: larguras.reduce((a, b) => a + b, 0) }}>{children}</View>
        </Larguras.Provider>
      </ScrollView>
    </View>
  );
}

function Celula({ no, estilo, children }: { no: ASTNode; estilo: MarkdownStyleMap; children: ReactNode }) {
  const larguras = useContext(Larguras);
  const alinhamento = /text-align:\s*(center|right)/.exec(no.attributes.style ?? '')?.[1];
  return (
    <View style={[estilo[`_VIEW_SAFE_${no.type}`], { width: larguras[no.index] }, no.index > 0 && estilo.celula_divisa,
      alinhamento ? { alignItems: ALINHAR[alinhamento] } : null]}>
      {children}
    </View>
  );
}

// Plain code blocks (the default fence pulls in a highlighter and an icon font); no remote images.
const regras: RenderRules = {
  image: () => null,
  fence: (node, _c, _p, styles) => <Text key={node.key} style={styles.fence}>{node.content.replace(/\n$/, '')}</Text>,
  code_block: (node, _c, _p, styles) => <Text key={node.key} style={styles.code_block}>{node.content.replace(/\n$/, '')}</Text>,
  table: (node, children, _p, styles) => <Tabela key={node.key} no={node} estilo={styles}>{children}</Tabela>,
  tr: (node, children, pais, styles) => {
    const secao = pais[0];
    const ultima = secao?.type === 'tbody' && node.index === secao.children.length - 1;
    return (
      <View key={node.key} style={[styles._VIEW_SAFE_tr, !ultima && styles.tr_divisa, secao?.type === 'tbody' && node.index % 2 === 1 && styles.tr_listra]}>
        {children}
      </View>
    );
  },
  th: (node, children, _p, styles) => <Celula key={node.key} no={node} estilo={styles}>{children}</Celula>,
  td: (node, children, _p, styles) => <Celula key={node.key} no={node} estilo={styles}>{children}</Celula>,
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
      <MarkdownStream colorScheme={tema.escuro ? 'dark' : 'light'} cursorColor={tema.colors.brand} cursorStyle={{ height: 18, width: 2, borderRadius: 1 }}
        markdownit={analisador} mergeStyle={false} onLinkPress={abrirLink} rules={regras} streaming={streaming} style={estilo}>
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
