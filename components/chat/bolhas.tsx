/**
 * The chat line components (P8): user/assistant bubbles, the compact
 * tool-status lines (label + pulse while start..end, done + results when
 * end), the sources row (tappable URLs), the error line with "Tentar de
 * novo" and the interruption note.
 *
 * Copy is pt-BR and ported from the old site (Fontes/StatusBlock); the
 * assistant bubble uses the glass.surface+hairline combo and the math-aware
 * Matematica renderer (raw text while streaming).
 */
import type { ReactNode } from 'react';
import {
  Animated,
  Linking,
  Pressable,
  Text,
  View,
  useWindowDimensions,
} from 'react-native';

import { descricaoDaFerramenta } from '../../lib/api';
import { fonts, useTheme } from '../../theme';
import type { Turno } from '../../app/(main)/chat/useChat';
import { Resposta } from './Resposta';
import Glass from '../Glass';

// ─────────────────────────────────────────────
// Sources ("Fontes consultadas")
// ─────────────────────────────────────────────

/** Port of the old site's `rotular`: host + path for the pill label. */
function rotular(url: string): string {
  try {
    const { hostname, pathname } = new URL(url);
    const host = hostname.replace(/^www\./, '');
    const caminho = pathname.replace(/\/+$/, '');
    return caminho ? `${host}${caminho}` : host;
  } catch {
    return url;
  }
}

export function Fontes({ urls }: { urls: string[] }) {
  const { colors, radius, spacing, typography } = useTheme();
  if (urls.length === 0) return null;
  return (
    <View style={{ marginTop: spacing.sm }}>
      <Text
        style={{
          color: colors.mutedForeground,
          fontFamily: fonts.bodyBold,
          fontSize: typography.xs.fontSize,
          marginBottom: spacing.xs,
          textTransform: 'uppercase',
          letterSpacing: 0.6,
          opacity: 0.8,
        }}
      >
        Fontes consultadas
      </Text>
      <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 6 }}>
        {urls.map((url) => (
          <Pressable
            key={url}
            accessibilityLabel={url}
            onPress={() => {
              void Linking.openURL(url).catch(() => undefined);
            }}
            style={{ maxWidth: '100%' }}
          >
            <Glass
              radius={radius.full}
              style={{
                flexDirection: 'row',
                alignItems: 'center',
                gap: 6,
                paddingVertical: 5,
                paddingHorizontal: spacing.sm,
              }}
            >
              <Text style={{ color: colors.brand, fontSize: typography.xs.fontSize }}>
                ↗
              </Text>
              <Text
                numberOfLines={1}
                style={{
                  color: colors.mutedForeground,
                  fontFamily: fonts.body,
                  fontSize: typography.xs.fontSize,
                  flexShrink: 1,
                }}
              >
              {rotular(url)}
              </Text>
            </Glass>
          </Pressable>
        ))}
      </View>
    </View>
  );
}

// ─────────────────────────────────────────────
// Status tags: the tool lines and the reasoning line
// ─────────────────────────────────────────────

/**
 * ONE shape for every status tag the stream produces.
 *
 * The tool tags and the reasoning tag used to be two different things: a
 * `radius.full` pill for the tools and, for the reasoning, a footer card that
 * said "respondendo…" and disappeared the moment the first tool started. They
 * are the same KIND of information — "this is what the USPapo is doing right
 * now, and this is where the answer is coming from" — so they are the same
 * component, with the same glass, the same pulse and the same two rows:
 *
 *   ● / ✓   Label            (brand while running, muted when finished)
 *           Description      (what was consulted, always present)
 *
 * The second row is why the radius is `lg` and not `full`: a pill cannot hold
 * two lines without the corners eating the text.
 */
export function Etiqueta({
  rotulo,
  descricao,
  pronta,
  pulso,
  testID,
}: {
  rotulo: string;
  descricao: string;
  pronta: boolean;
  pulso: Animated.AnimatedInterpolation<number>;
  testID?: string;
}) {
  const { colors, radius, spacing, typography } = useTheme();
  return (
    <View style={{ alignSelf: 'flex-start', maxWidth: '92%' }}>
      <Glass
        testID={testID}
        radius={radius.lg}
        style={{
          flexDirection: 'row',
          alignItems: 'flex-start',
          gap: spacing.xs,
          paddingHorizontal: spacing.md,
          paddingVertical: 8,
        }}
      >
        {pronta ? (
          <Text
            style={{
              color: colors.brand,
              fontSize: typography.xs.fontSize,
              lineHeight: typography.xs.lineHeight,
            }}
          >
            ✓
          </Text>
        ) : (
          <Animated.Text
            style={{
              color: colors.brand,
              fontFamily: fonts.body,
              fontSize: typography.xs.fontSize,
              lineHeight: typography.xs.lineHeight,
              opacity: pulso,
            }}
          >
            ●
          </Animated.Text>
        )}
        <View style={{ flexShrink: 1, gap: 1 }}>
          <Text
            numberOfLines={1}
            style={{
              color: pronta ? colors.mutedForeground : colors.brand,
              fontFamily: fonts.bodyBold,
              fontSize: typography.xs.fontSize,
              lineHeight: typography.xs.lineHeight,
            }}
          >
            {rotulo}
          </Text>
          <Text
            numberOfLines={2}
            style={{
              color: colors.faintForeground,
              fontFamily: fonts.body,
              fontSize: typography.xs.fontSize,
              lineHeight: typography.xs.lineHeight,
            }}
          >
            {descricao}
          </Text>
        </View>
      </Glass>
    </View>
  );
}

/** One tool call: its pt-BR label, what it consulted, and the results count. */
export function LinhaFerramenta({
  turno,
  pulso,
}: {
  turno: Extract<Turno, { autor: 'ferramenta' }>;
  pulso: Animated.AnimatedInterpolation<number>;
}) {
  const rotulo =
    turno.pronta && turno.resultados > 0
      ? `${turno.rotulo} · ${turno.resultados}`
      : turno.rotulo;
  return (
    <Etiqueta
      testID="etiqueta-ferramenta"
      rotulo={rotulo}
      descricao={descricaoDaFerramenta(turno.nome)}
      pronta={turno.pronta}
      pulso={pulso}
    />
  );
}

/** The label of the reasoning tag, by state. */
const ROTULO_RACIOCINIO_ATIVO = 'Raciocinando';
const ROTULO_RACIOCINIO_PRONTO = 'Raciocínio';
/** What the reasoning tag says when the provider sends no reasoning text. */
const DESCRICAO_RACIOCINIO = 'O USPapo está pensando na resposta.';
const DESCRICAO_RACIOCINIO_PRONTO = 'O USPapo pensou antes de responder.';

/** Reasoning text → the tag's second row (one line, collapsed whitespace). */
export function resumoDoRaciocinio(texto: string, pronta: boolean): string {
  const limpo = texto.replace(/\s+/g, ' ').trim();
  if (limpo === '') {
    return pronta ? DESCRICAO_RACIOCINIO_PRONTO : DESCRICAO_RACIOCINIO;
  }
  return limpo;
}

/**
 * The reasoning tag. Same component as a tool tag by design — and, unlike the
 * footer card it replaces, it is a LINE OF THE CONVERSATION, so it stays on
 * screen after a tool call instead of being swapped out by the first `tool`
 * event.
 */
export function LinhaRaciocinio({
  turno,
  pulso,
}: {
  turno: Extract<Turno, { autor: 'raciocinio' }>;
  pulso: Animated.AnimatedInterpolation<number>;
}) {
  return (
    <Etiqueta
      testID="etiqueta-raciocinio"
      rotulo={turno.pronta ? ROTULO_RACIOCINIO_PRONTO : ROTULO_RACIOCINIO_ATIVO}
      descricao={resumoDoRaciocinio(turno.texto, turno.pronta)}
      pronta={turno.pronta}
      pulso={pulso}
    />
  );
}

/**
 * The reasoning tag for the stretch where the provider reports NOTHING: the
 * wait before the first token, and the gap after a tool answered. It is the
 * same tag, so the student sees one continuous "working" state instead of a
 * card that vanishes as soon as a tool runs.
 */
export function RaciocinioImplicito({
  pulso,
}: {
  pulso: Animated.AnimatedInterpolation<number>;
}) {
  return (
    <Etiqueta
      testID="etiqueta-raciocinio"
      rotulo={ROTULO_RACIOCINIO_ATIVO}
      descricao={DESCRICAO_RACIOCINIO}
      pronta={false}
      pulso={pulso}
    />
  );
}

// ─────────────────────────────────────────────
// Error line + "Tentar de novo"
// ─────────────────────────────────────────────

export function LinhaErro({
  turno,
  aoTentar,
  podeTentar,
}: {
  turno: Extract<Turno, { autor: 'erro' }>;
  aoTentar: () => void;
  podeTentar: boolean;
}) {
  const { colors, radius, spacing, typography } = useTheme();
  return (
    // Glass, like every other surface: this used to be a flat `colors.scrim`
    // fill, which in dark mode is #000000 — a solid black slab in the middle
    // of a translucent app. The danger colour stays, as the left edge over
    // the hairline, so the line still reads as an error at a glance.
    <Glass
      radius={radius.lg}
      borda={{ borderLeftColor: colors.danger, borderLeftWidth: 3 }}
      style={{
        alignSelf: 'flex-start',
        maxWidth: '92%',
        padding: spacing.md,
        gap: spacing.sm,
      }}
    >
      <Text
        style={{
          color: colors.foreground,
          fontFamily: fonts.body,
          fontSize: typography.sm.fontSize,
          lineHeight: typography.sm.lineHeight,
        }}
      >
        {turno.mensagem}
      </Text>
      {podeTentar && turno.tipo !== 'sessao' ? (
        <Pressable
          onPress={aoTentar}
          disabled={!podeTentar}
          style={({ pressed }) => ({
            alignSelf: 'flex-start',
            backgroundColor: colors.brand,
            borderRadius: radius.full,
            opacity: pressed ? 0.85 : 1,
            paddingHorizontal: spacing.md,
            paddingVertical: 6,
          })}
          accessibilityLabel="Tentar de novo"
        >
          <Text
            style={{
              color: colors.brandForeground,
              fontFamily: fonts.bodyBold,
              fontSize: typography.xs.fontSize,
            }}
          >
            Tentar de novo
          </Text>
        </Pressable>
      ) : null}
    </Glass>
  );
}

// ─────────────────────────────────────────────
// Interruption note (Stop pressed)
// ─────────────────────────────────────────────

export function LinhaNota({ texto }: { texto: string }) {
  const { colors, spacing, typography } = useTheme();
  return (
    <Text
      style={{
        color: colors.faintForeground,
        fontFamily: fonts.body,
        fontSize: typography.xs.fontSize,
        fontStyle: 'italic',
        alignSelf: 'flex-start',
        marginTop: spacing.xs,
      }}
    >
      {texto}
    </Text>
  );
}

// ─────────────────────────────────────────────
// Bubbles
// ─────────────────────────────────────────────

/**
 * The question, as the old site draws it: a glass pill on the right — not a
 * brand-filled messenger bubble — with foreground text at the `text-lg` step
 * and the fully rounded `rounded-[2rem]` corner.
 */
export function BolhaUsuario({ texto }: { texto: string }) {
  const { colors, typography } = useTheme();
  const { width } = useWindowDimensions();
  return (
    <Glass
      radius={32}
      style={{
          alignSelf: 'flex-end',
          // Old: max-w-[85%] with a sm: step down to 75%.
          maxWidth: width >= 640 ? '75%' : '85%',
          paddingHorizontal: 20,
          paddingVertical: 12,
      }}
    >
      <Text
        style={{
          color: colors.foreground,
          fontFamily: fonts.body,
          fontSize: typography.lg.fontSize,
          lineHeight: typography.lg.lineHeight,
        }}
      >
        {texto}
      </Text>
        </Glass>
  );
}

export function BolhaAssistente({
  turno,
  children,
}: {
  turno: Extract<Turno, { autor: 'assistant' }>;
  /** The feedback row (like/dislike), rendered under the answer. */
  children?: ReactNode;
}) {
  return (
    <View style={{ alignSelf: 'stretch', width: '100%' }}>
      <View>
        {/* The answer has no bubble on the old site: it is body copy set on
            the page, full measure, which is what makes a long reply readable.
            components/chat/Resposta renders it as MARKDOWN and paces the
            reveal while the stream runs. */}
        <Resposta texto={turno.texto} streaming={!turno.completo} />
      </View>
      <Fontes urls={turno.fontes} />
      {children}
    </View>
  );
}
