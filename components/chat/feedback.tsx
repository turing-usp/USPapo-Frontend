/**
 * The like/dislike row under a completed answer — port of the old site's
 * FeedbackBot (site/components/FeedbackBot.tsx), same copy and same flow:
 *
 * - 👍 saves `tipo: 'like'` at once; tapping it again removes the row;
 * - 👎 saves `tipo: 'dislike'` at once AND opens the form, so an abandoned
 *   form still leaves the rating recorded;
 * - the form carries the four suggested reasons and a free-text comment,
 *   and "Enviar feedback" re-saves the row with both. The comment is the
 *   `comentario` column the analytics panel lists, which is why it exists
 *   at all — without it the panel only ever shows a bare count.
 *
 * Everything is written through lib/feedback (`mensagem_feedbacks`), NOT
 * through `favoritar`: the rating and the `favorita` flag are different
 * facts, and routing 👍 through the flag used to pin the conversation and
 * hit the 5-favorites trigger as a side effect of praising an answer.
 *
 * The thumbs are monochrome stroked SVG (components/BrandMarks), so they
 * take the brand/danger tint the state needs — an emoji cannot be tinted.
 */
import React, { useState } from 'react';
import { Pressable, Text, TextInput, View } from 'react-native';

import Glass from '../Glass';
import {
  CheckIcon,
  CloseIcon,
  ThumbsDownIcon,
  ThumbsUpIcon,
} from '../BrandMarks';
import { haptics } from '../../lib/haptics';
import {
  removerFeedback,
  salvarFeedback,
  type TipoFeedback,
} from '../../lib/feedback';
import { fonts, useTheme } from '../../theme';

/** The old site's suggested reasons (MOTIVOS_SUGERIDOS, ported verbatim). */
const MOTIVOS = [
  'Informação incorreta',
  'Resposta incompleta',
  'Resposta confusa',
  'Outro',
] as const;

const OBRIGADO = 'Obrigado pelo seu feedback! Ele nos ajuda a melhorar.';
const FALHA = 'Não foi possível salvar a avaliação.';

export type FeedbackRespostaProps = {
  userId: string;
  conversaId: string;
  /**
   * Which ANSWER of the conversation this rating is about
   * (`mensagens.ordem`). A conversation has many turns, and the row is keyed
   * by (conversa_id, mensagem_ordem, user_id): without it every 👍 in a
   * conversation would overwrite the previous one.
   */
  mensagemOrdem?: number;
  /** The rating already stored for this answer, when it was loaded. */
  inicial?: { tipo: TipoFeedback; motivo: string | null; comentario: string | null } | null;
};

export function FeedbackResposta({
  userId,
  conversaId,
  mensagemOrdem = 0,
  inicial,
}: FeedbackRespostaProps) {
  const { colors, radius, spacing, typography } = useTheme();

  const [avaliacao, setAvaliacao] = useState<'none' | TipoFeedback>(inicial?.tipo ?? 'none');
  const [mostrarForm, setMostrarForm] = useState(false);
  const [motivo, setMotivo] = useState(inicial?.motivo ?? '');
  const [comentario, setComentario] = useState(inicial?.comentario ?? '');
  const [comentarioFocado, setComentarioFocado] = useState(false);
  const [salvando, setSalvando] = useState(false);
  const [enviado, setEnviado] = useState(false);
  const [erro, setErro] = useState<string | null>(null);

  /**
   * The stored rating arrives after the first render (the screen loads the
   * turn, then the feedback), so it is applied DURING render rather than
   * from an effect — an effect would paint one frame with the buttons blank
   * and let the student rate the same answer twice, which is exactly the
   * duplicate the analytics panel then shows. Same fix as the old site.
   */
  const [aplicado, setAplicado] = useState(inicial);
  if (inicial !== aplicado) {
    setAplicado(inicial);
    setAvaliacao(inicial?.tipo ?? 'none');
    setMotivo(inicial?.motivo ?? '');
    setComentario(inicial?.comentario ?? '');
  }

  const aoLike = async () => {
    if (salvando) return;
    const novo = avaliacao === 'like' ? 'none' : 'like';
    setAvaliacao(novo);
    setMostrarForm(false);
    setEnviado(false);
    setErro(null);
    setSalvando(true);
    const ok =
      novo === 'like'
        ? await salvarFeedback({ userId, conversaId, mensagemOrdem, tipo: 'like' })
        : await removerFeedback({ userId, conversaId, mensagemOrdem });
    setSalvando(false);
    if (!ok) {
      setAvaliacao(novo === 'like' ? 'none' : 'like'); // roll the toggle back
      setErro(FALHA);
      void haptics.error();
      return;
    }
    void (novo === 'like' ? haptics.like() : haptics.favorite());
  };

  const aoDislike = async () => {
    if (salvando) return;
    const novo = avaliacao === 'dislike' ? 'none' : 'dislike';
    setAvaliacao(novo);
    setEnviado(false);
    setErro(null);
    setSalvando(true);
    // The dislike is recorded immediately: a form the student closes without
    // sending still counts as "this answer was bad".
    const ok =
      novo === 'dislike'
        ? await salvarFeedback({
            userId,
            conversaId,
            mensagemOrdem,
            tipo: 'dislike',
            motivo: motivo || undefined,
            comentario: comentario || undefined,
          })
        : await removerFeedback({ userId, conversaId, mensagemOrdem });
    setSalvando(false);
    if (!ok) {
      setAvaliacao(novo === 'dislike' ? 'none' : 'dislike');
      setErro(FALHA);
      void haptics.error();
      return;
    }
    setMostrarForm(novo === 'dislike');
    void haptics.dislike();
  };

  const enviarComentario = async () => {
    if (salvando) return;
    setSalvando(true);
    setErro(null);
    const ok = await salvarFeedback({
      userId,
      conversaId,
      mensagemOrdem,
      tipo: 'dislike',
      motivo: motivo || undefined,
      comentario: comentario.trim() || undefined,
    });
    setSalvando(false);
    if (!ok) {
      setErro(FALHA);
      void haptics.error();
      return;
    }
    setEnviado(true);
    void haptics.like();
  };

  /** The 44pt-tall tinted square each thumb sits in. */
  const alvo = (ativo: boolean, tom: string) => ({
    alignItems: 'center' as const,
    justifyContent: 'center' as const,
    height: 32,
    width: 32,
    borderRadius: radius.md,
    backgroundColor: ativo ? tom : 'transparent',
  });

  return (
    <View style={{ marginTop: spacing.sm, alignSelf: 'flex-start', maxWidth: '92%', width: '100%' }}>
      <View style={{ flexDirection: 'row', alignItems: 'center', gap: spacing.sm }}>
        <Text
          style={{
            color: colors.mutedForeground,
            fontFamily: fonts.body,
            fontSize: typography.xs.fontSize,
            opacity: 0.8,
          }}
        >
          A resposta foi útil?
        </Text>
        <View style={{ flexDirection: 'row', gap: 2 }}>
          <Pressable
            onPress={() => void aoLike()}
            disabled={salvando}
            accessibilityRole="button"
            accessibilityLabel="Resposta útil"
            style={({ pressed }) => [
              alvo(avaliacao === 'like', colors.surface),
              pressed && { opacity: 0.7 },
            ]}
          >
            <ThumbsUpIcon
              size={17}
              color={avaliacao === 'like' ? colors.brand : colors.mutedForeground}
            />
          </Pressable>
          <Pressable
            onPress={() => void aoDislike()}
            disabled={salvando}
            accessibilityRole="button"
            accessibilityLabel="Resposta ruim"
            style={({ pressed }) => [
              alvo(avaliacao === 'dislike', colors.surface),
              pressed && { opacity: 0.7 },
            ]}
          >
            <ThumbsDownIcon
              size={17}
              color={avaliacao === 'dislike' ? colors.danger : colors.mutedForeground}
            />
          </Pressable>
        </View>
      </View>

      {mostrarForm ? (
        <Glass
          radius={radius.lg}
          style={{ marginTop: spacing.sm, padding: spacing.md, gap: spacing.sm, width: '100%' }}
        >
          <View
            style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' }}
          >
            <Text
              style={{
                color: colors.foreground,
                fontFamily: fonts.bodyBold,
                fontSize: typography.sm.fontSize,
                flexShrink: 1,
              }}
            >
              Como podemos melhorar esta resposta?
            </Text>
            <Pressable
              onPress={() => setMostrarForm(false)}
              hitSlop={8}
              accessibilityLabel="Fechar"
              style={({ pressed }) => [{ padding: 2 }, pressed && { opacity: 0.6 }]}
            >
              <CloseIcon size={16} color={colors.mutedForeground} />
            </Pressable>
          </View>

          {enviado ? (
            <View style={{ flexDirection: 'row', alignItems: 'center', gap: spacing.xs }}>
              <CheckIcon size={16} color={colors.brand} />
              <Text
                style={{
                  color: colors.brand,
                  fontFamily: fonts.bodyBold,
                  fontSize: typography.xs.fontSize,
                  flexShrink: 1,
                }}
              >
                {OBRIGADO}
              </Text>
            </View>
          ) : (
            <>
              <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 6 }}>
                {MOTIVOS.map((m) => {
                  const selecionado = motivo === m;
                  return (
                    <Pressable
                      key={m}
                      onPress={() => setMotivo(selecionado ? '' : m)}
                      style={({ pressed }) => [
                        {
                          borderRadius: radius.full,
                          borderWidth: 1,
                          borderColor: selecionado ? colors.brand : colors.line,
                          backgroundColor: selecionado ? colors.surface : 'transparent',
                          paddingHorizontal: spacing.sm,
                          paddingVertical: 5,
                        },
                        pressed && { opacity: 0.7 },
                      ]}
                    >
                      <Text
                        style={{
                          color: selecionado ? colors.brand : colors.mutedForeground,
                          fontFamily: selecionado ? fonts.bodyBold : fonts.body,
                          fontSize: typography.xs.fontSize,
                        }}
                      >
                        {m}
                      </Text>
                    </Pressable>
                  );
                })}
              </View>

              {/* The old site's `glass glass-field rounded-xl` textarea: the
                  neutral filament lights up in the brand colour on focus.
                  Built here instead of with CampoVidro because that one is a
                  fixed `radius.full` pill with a single-line input style. */}
              <Glass
                radius={radius.lg}
                borda={
                  comentarioFocado
                    ? { borderColor: colors.brand, borderWidth: 2 }
                    : undefined
                }
                style={{ paddingHorizontal: 12, paddingVertical: 8, width: '100%' }}
              >
                <TextInput
                  value={comentario}
                  onChangeText={setComentario}
                  onFocus={() => setComentarioFocado(true)}
                  onBlur={() => setComentarioFocado(false)}
                  placeholder="Conte detalhadamente o que esteve errado (opcional)..."
                  placeholderTextColor={colors.mutedForeground}
                  selectionColor={colors.brand}
                  multiline
                  numberOfLines={3}
                  style={{
                    color: colors.foreground,
                    fontFamily: fonts.body,
                    fontSize: typography.sm.fontSize,
                    minHeight: 66,
                    textAlignVertical: 'top',
                    outlineStyle: 'none',
                  } as object}
                />
              </Glass>

              <View
                style={{ flexDirection: 'row', justifyContent: 'flex-end', gap: spacing.sm }}
              >
                <Pressable
                  onPress={() => setMostrarForm(false)}
                  style={({ pressed }) => [
                    { paddingHorizontal: spacing.sm, paddingVertical: 8 },
                    pressed && { opacity: 0.7 },
                  ]}
                >
                  <Text
                    style={{
                      color: colors.mutedForeground,
                      fontFamily: fonts.body,
                      fontSize: typography.xs.fontSize,
                    }}
                  >
                    Cancelar
                  </Text>
                </Pressable>
                <Pressable
                  onPress={() => void enviarComentario()}
                  disabled={salvando}
                  style={({ pressed }) => [
                    {
                      backgroundColor: colors.brand,
                      borderRadius: radius.md,
                      paddingHorizontal: spacing.md,
                      paddingVertical: 8,
                      opacity: salvando ? 0.5 : pressed ? 0.85 : 1,
                    },
                  ]}
                >
                  <Text
                    style={{
                      color: colors.brandForeground,
                      fontFamily: fonts.bodyBold,
                      fontSize: typography.xs.fontSize,
                    }}
                  >
                    {salvando ? 'Enviando...' : 'Enviar feedback'}
                  </Text>
                </Pressable>
              </View>
            </>
          )}
        </Glass>
      ) : null}

      {erro ? (
        <Text
          style={{
            color: colors.danger,
            fontFamily: fonts.body,
            fontSize: typography.xs.fontSize,
            marginTop: spacing.xs,
          }}
        >
          {erro}
        </Text>
      ) : null}
    </View>
  );
}
