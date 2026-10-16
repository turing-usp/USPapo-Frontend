/**
 * The assistant answer: markdown revealed at a steady pace while streaming.
 *
 * The text is split into blocks (blank-line separated, fences kept whole) and
 * each block is a memoized renderer with a stable key: finished blocks never
 * re-parse, and every new block fades and rises in — the streaming animation.
 * One cursor follows the text down (the thinking mark collapses into it).
 * A finished answer with formulas renders through KaTeX (components/chat/Matematica).
 * Tables size each column to its content and scroll sideways when they cannot fit.
 */
import {
  createMarkdownIt, MarkdownStream, sealIncompleteMarkdown, type ASTNode, type MarkdownStyleMap, type RenderRules,
} from '@ronradtke/react-native-markdown-display';
import React, { createContext, memo, useContext, useEffect, useEffectEvent, useMemo, useRef, useState, type ReactNode } from 'react';
import { Animated, Easing, Linking, ScrollView, Text, View, useWindowDimensions, type ViewStyle } from 'react-native';

import { Matematica } from './Matematica';
import { blocos, distribuirColunas, medirColunas, quebras, selar, temMatematica, tintasDaTabela } from '../../lib/markdown';
import { useTheme, type Theme } from '../../theme';

/**
 * Characters on screen now: chases the received text ~0.25 s behind, never slower than 30 chars/s.
 * `revelar` starts from nothing even when the text is already complete.
 */
export function useRevelacao(texto: string, streaming: boolean, revelar = streaming): string {
  const [revelado, setRevelado] = useState(() => (revelar ? 0 : texto.length));
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

const analisador = createMarkdownIt({ plugins: [quebras] });

/**
 * The manual's type: text in M PLUS 1p, every heading (and table header) in Changa, code in Roboto
 * Mono, framed in orange like the manual's own code sample.
 */
function estilos({ colors, fonts, radius, spacing, typography }: Theme): MarkdownStyleMap {
  // Leaves take the nearest styled ancestor's text style (body, strong, heading, cell): `text` and
  // `textgroup` stay empty, or they would override bold, headings and table cells with the body style.
  const corpo = { color: colors.foreground, fontFamily: fonts.body, ...typography.lg };
  const { linha, cabecalho: tinta, listra } = tintasDaTabela(colors.foreground);
  const celula = { paddingHorizontal: spacing.md, paddingVertical: spacing.sm, ...typography.sm, color: colors.foreground };
  const titulo = (passo: keyof typeof typography, cor = colors.foreground) => ({
    flexDirection: 'row' as const, flexWrap: 'wrap' as const, color: cor, fontFamily: fonts.title, ...typography[passo], marginTop: spacing.md, marginBottom: spacing.xs,
  });
  const codigo = { borderColor: colors.brand, borderRadius: radius.md, borderWidth: 1, color: colors.foreground,
    fontFamily: fonts.mono, ...typography.sm, marginBottom: spacing.md, padding: spacing.md };
  return {
    body: corpo, text: {}, textgroup: {},
    paragraph: { marginTop: 0, marginBottom: spacing.md, flexWrap: 'wrap', flexDirection: 'row', width: '100%' },
    heading1: titulo('2xl'), heading2: titulo('xl'), heading3: titulo('lg'),
    heading4: titulo('base'), heading5: titulo('sm', colors.mutedForeground), heading6: titulo('xs', colors.mutedForeground),
    strong: { fontFamily: fonts.bodyBold, color: colors.foreground },
    em: { fontStyle: 'italic', color: colors.mutedForeground },
    s: { textDecorationLine: 'line-through' },
    link: { color: colors.accent, textDecorationLine: 'underline' },
    hr: { backgroundColor: linha, height: 1, marginVertical: spacing.lg },
    blockquote: { backgroundColor: 'transparent', borderLeftColor: colors.brand, borderLeftWidth: 2, marginLeft: 0, paddingLeft: spacing.md, marginBottom: spacing.md },
    bullet_list: { marginBottom: spacing.md }, ordered_list: { marginBottom: spacing.md },
    list_item: { flexDirection: 'row', marginBottom: spacing.xs },
    bullet_list_icon: { color: colors.brand, ...typography.lg, marginLeft: 0, marginRight: spacing.sm },
    ordered_list_icon: { ...corpo, color: colors.mutedForeground, marginLeft: 0, marginRight: spacing.sm },
    bullet_list_content: { flex: 1 }, ordered_list_content: { flex: 1 },
    code_inline: { backgroundColor: tinta, borderRadius: radius.sm, borderWidth: 0, color: colors.foreground, fontFamily: fonts.mono, fontSize: typography.sm.fontSize, paddingHorizontal: 5 },
    code_block: codigo, fence: codigo,
    table: { borderColor: linha, borderRadius: radius.md, borderWidth: 1, marginBottom: spacing.md, overflow: 'hidden' },
    thead: { backgroundColor: tinta },
    tr: { borderColor: linha, flexDirection: 'row' },
    tr_divisa: { borderBottomWidth: 1 },
    tr_listra: { backgroundColor: listra },
    th: { ...celula, fontFamily: fonts.title },
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
  // M PLUS 1p averages ~0.51 em over table text, but its digits are 0.62 em: 0.6 keeps times and codes on one line.
  const { larguras, rola } = distribuirColunas(medirColunas(linhas), disponivel, {
    caractere: typography.sm.fontSize * 0.6, folga: 2 * spacing.md + 1, minimo: 56, maximo: 280, conforto: 120,
  });
  const corpo = (
    <Larguras.Provider value={larguras}>
      <View style={{ width: larguras.reduce((a, b) => a + b, 0) }}>{children}</View>
    </Larguras.Provider>
  );
  // A table that fits is a plain View: a disabled ScrollView is `touch-action: none` on the web,
  // and a swipe starting on the table could not scroll the conversation.
  return (
    <View style={estilo._VIEW_SAFE_table} onLayout={(e) => setDisponivel(Math.floor(e.nativeEvent.layout.width) - 2)}>
      {rola ? <ScrollView horizontal nestedScrollEnabled bounces={false}>{corpo}</ScrollView> : corpo}
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
      <MarkdownStream colorScheme={tema.escuro ? 'dark' : 'light'} markdownit={analisador} mergeStyle={false} onLinkPress={abrirLink}
        rules={regras} style={estilo}>
        {streaming ? sealIncompleteMarkdown(selar(texto)) : texto}
      </MarkdownStream>
    </Animated.View>
  );
});

/** The cursor under the text being written: where it sits in an empty answer (the mark's target). */
export const CURSOR = { x: 0, y: 4, largura: 2, altura: 18 };
/** Without new text for this long, the cursor starts blinking. */
const ESPERA_MS = 600;

/**
 * Solid while the text grows, a soft blink while it waits, and a fade when the answer is done
 * (`aoSair`). It glides down to each new line. Only opacity and position animate, on the native driver.
 */
function Cursor({ y, escrito, ativo, aoSair }: { y: number; escrito: number; ativo: boolean; aoSair: () => void }) {
  const { colors } = useTheme();
  const [opacidade] = useState(() => new Animated.Value(1));
  const [topo] = useState(() => new Animated.Value(y));
  const sair = useEffectEvent(aoSair);

  useEffect(() => {
    Animated.timing(topo, { toValue: y, duration: 120, easing: Easing.out(Easing.cubic), useNativeDriver: true }).start();
  }, [y, topo]);

  useEffect(() => {
    opacidade.stopAnimation();
    if (!ativo) {
      Animated.timing(opacidade, { toValue: 0, duration: 200, easing: Easing.in(Easing.cubic), useNativeDriver: true })
        .start(({ finished }) => finished && sair());
      return;
    }
    opacidade.setValue(1);
    const piscar = Animated.loop(Animated.sequence([
      Animated.timing(opacidade, { toValue: 0, duration: 180, easing: Easing.inOut(Easing.ease), useNativeDriver: true }),
      Animated.delay(300),
      Animated.timing(opacidade, { toValue: 1, duration: 180, easing: Easing.inOut(Easing.ease), useNativeDriver: true }),
      Animated.delay(540),
    ]));
    const espera = setTimeout(() => piscar.start(), ESPERA_MS);
    return () => {
      clearTimeout(espera);
      piscar.stop();
    };
  }, [escrito, ativo, opacidade]);

  return (
    <Animated.View pointerEvents="none" style={{
      position: 'absolute', left: CURSOR.x, top: CURSOR.y, width: CURSOR.largura, height: CURSOR.altura, borderRadius: CURSOR.largura / 2,
      backgroundColor: colors.brand, opacity: opacidade, transform: [{ translateY: topo }],
    }} />
  );
}

/**
 * `revelar` (a live answer, taking over from the thinking mark) reveals the text from the start with
 * the cursor; `aoRevelar` fires once all of it is on screen and the cursor has gone.
 */
export default function Resposta({ texto, streaming, revelar = streaming, aoRevelar }: {
  texto: string; streaming: boolean; revelar?: boolean; aoRevelar?: () => void;
}) {
  const tema = useTheme();
  const visivel = useRevelacao(texto, streaming, revelar);
  const estilo = useMemo(() => estilos(tema), [tema]);
  const [animar] = useState(revelar); // saved answers open without animation
  const [cursor, setCursor] = useState(revelar);
  const [altura, setAltura] = useState(0);
  const escrevendo = streaming || visivel.length < texto.length;
  const revelada = useEffectEvent(() => aoRevelar?.());

  useEffect(() => {
    if (!escrevendo && !cursor) revelada();
  }, [escrevendo, cursor]);

  if (!escrevendo && !cursor && temMatematica(texto)) return <Matematica texto={texto} />;
  const partes = blocos(visivel);
  return (
    <View>
      <View onLayout={(e) => setAltura(e.nativeEvent.layout.height)}>
        {partes.map((parte, i) => (
          <Bloco key={i} texto={parte} streaming={escrevendo && i === partes.length - 1} animar={animar} tema={tema} estilo={estilo} />
        ))}
      </View>
      {cursor ? (
        <>
          <View style={{ height: CURSOR.y + CURSOR.altura }} />
          <Cursor y={altura} escrito={visivel.length} ativo={escrevendo} aoSair={() => setCursor(false)} />
        </>
      ) : null}
    </View>
  );
}
