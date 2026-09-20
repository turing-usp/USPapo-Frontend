/**
 * The like/dislike row under a completed answer (port of the old site's
 * FeedbackBot, adapted to the new store):
 *
 * - 👍 útil → `favoritar(userId, id, true)` (the `favorita` flag),
 *   haptics.like;
 * - 👎 ruim → the old site's reason chips appear inline; picking one
 *   commits `favoritar(userId, id, false)` + haptics.dislike (the reason
 *   itself is not stored yet — the feedback table is the P10 analytics
 *   panel's job);
 * - the 5-favorites cap is enforced by the DB trigger (authoritative): the
 *   call is optimistic and rolls back on the server's rejection (the
 *   lib/conversations docstring's "optimistic rollback" contract).
 */
import { Pressable, Text, View } from 'react-native';
import React, { useState } from 'react';

import { favoritar } from '../../lib/conversations';
import { haptics } from '../../lib/haptics';
import { fonts, useTheme } from '../../theme';

/** The old site's suggested reasons (MOTIVOS_SUGERIDOS, ported verbatim). */
const MOTIVOS = [
  'Informação incorreta',
  'Resposta incompleta',
  'Resposta confusa',
  'Outro',
] as const;

const OBRIGADO = 'Obrigado pelo seu feedback!';

export type FeedbackRespostaProps = {
  userId: string;
  conversaId: string;
  /** The loaded row's `favorita` flag (the initial state). */
  inicial: boolean;
};

export function FeedbackResposta({ userId, conversaId, inicial }: FeedbackRespostaProps) {
  const { colors, glass, radius, spacing, typography } = useTheme();
  const [avaliacao, setAvaliacao] = useState<'none' | 'like' | 'dislike'>(
    inicial ? 'like' : 'none',
  );
  const [salvando, setSalvando] = useState(false);
  const [enviado, setEnviado] = useState(false);
  const [erro, setErro] = useState<string | null>(null);

  const pill = (ativo: boolean) => ({
    borderRadius: radius.full,
    paddingVertical: 5,
    paddingHorizontal: spacing.sm,
    borderWidth: 1,
    borderColor: colors.line,
    opacity: 1,
    backgroundColor: ativo ? colors.brand : 'transparent',
  });

  const aoLike = async () => {
    if (salvando) return;
    const novo = avaliacao === 'like' ? 'none' : 'like';
    setAvaliacao(novo);
    setEnviado(false);
    setErro(null);
    setSalvando(true);
    try {
      await favoritar(userId, conversaId, novo === 'like');
      if (novo === 'like') {
        void haptics.like();
        setEnviado(true);
      } else {
        void haptics.favorite();
      }
    } catch (e) {
      // The trigger rejected it (the 5-favorites cap) or the write failed:
      // roll the optimistic state back and show the server's reason.
      setAvaliacao(novo === 'like' ? 'none' : 'like');
      setErro(e instanceof Error ? e.message : 'Não foi possível salvar a avaliação.');
      void haptics.error();
    } finally {
      setSalvando(false);
    }
  };

  const aoDislike = () => {
    if (salvando) return;
    // 👎 already on: a second tap closes the reason picker (no write).
    if (avaliacao === 'dislike') {
      setAvaliacao('none');
      setEnviado(false);
      return;
    }
    setAvaliacao('dislike');
    setEnviado(false);
    setErro(null);
  };

  const aoMotivo = async (motivo: string) => {
    if (salvando) return;
    setSalvando(true);
    try {
      // The reason is acknowledged inline (P10 stores it with the feedback
      // table); the store seam here is the favorita flag going off.
      await favoritar(userId, conversaId, false);
      void haptics.dislike();
      setEnviado(true);
      void motivo;
    } catch (e) {
      setErro(e instanceof Error ? e.message : 'Não foi possível salvar a avaliação.');
      void haptics.error();
    } finally {
      setSalvando(false);
    }
  };

  return (
    <View style={{ marginTop: spacing.sm, alignSelf: 'flex-start', maxWidth: '92%' }}>
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
        <View style={{ flexDirection: 'row', gap: 6 }}>
          <Pressable
            onPress={() => void aoLike()}
            disabled={salvando}
            style={({ pressed }) => [pill(avaliacao === 'like'), pressed && { opacity: 0.85 }]}
            accessibilityLabel="Resposta útil"
          >
            <Text
              style={{
                color: avaliacao === 'like' ? colors.brandForeground : colors.mutedForeground,
                fontFamily: fonts.bodyBold,
                fontSize: typography.xs.fontSize,
              }}
            >
              👍 útil
            </Text>
          </Pressable>
          <Pressable
            onPress={aoDislike}
            disabled={salvando}
            style={({ pressed }) => [
              pill(false),
              {
                borderColor: avaliacao === 'dislike' ? colors.danger : colors.line,
                backgroundColor: avaliacao === 'dislike' ? colors.surface : 'transparent',
              },
              pressed && { opacity: 0.85 },
            ]}
            accessibilityLabel="Resposta ruim"
          >
            <Text
              style={{
                color: avaliacao === 'dislike' ? colors.foreground : colors.mutedForeground,
                fontFamily: fonts.bodyBold,
                fontSize: typography.xs.fontSize,
              }}
            >
              👎 ruim
            </Text>
          </Pressable>
        </View>
      </View>

      {enviado && avaliacao !== 'dislike' ? (
        <Text
          style={{
            color: colors.brand,
            fontFamily: fonts.body,
            fontSize: typography.xs.fontSize,
            marginTop: spacing.xs,
          }}
        >
          {OBRIGADO}
        </Text>
      ) : null}

      {avaliacao === 'dislike' && !enviado ? (
        <View
          style={[
            glass.surface,
            glass.hairline,
            {
              borderRadius: radius.lg,
              marginTop: spacing.sm,
              padding: spacing.md,
              gap: spacing.sm,
              width: '100%',
            },
          ]}
        >
          <Text
            style={{
              color: colors.foreground,
              fontFamily: fonts.bodyBold,
              fontSize: typography.sm.fontSize,
            }}
          >
            Como podemos melhorar esta resposta?
          </Text>
          <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 6 }}>
            {MOTIVOS.map((motivo) => (
              <Pressable
                key={motivo}
                onPress={() => void aoMotivo(motivo)}
                disabled={salvando}
                style={({ pressed }) => [pill(false), { opacity: pressed ? 0.7 : 1 }]}
              >
                <Text
                  style={{
                    color: colors.mutedForeground,
                    fontFamily: fonts.body,
                    fontSize: typography.xs.fontSize,
                  }}
                >
                  {motivo}
                </Text>
              </Pressable>
            ))}
          </View>
        </View>
      ) : null}

      {avaliacao === 'dislike' && enviado ? (
        <Text
          style={{
            color: colors.brand,
            fontFamily: fonts.body,
            fontSize: typography.xs.fontSize,
            marginTop: spacing.xs,
          }}
        >
          {OBRIGADO}
        </Text>
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
