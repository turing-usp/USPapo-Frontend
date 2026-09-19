/**
 * Conversation screen (deep-linkable: usapo://chat/<id> /
 * https://uspapo.turingusp.com/chat/<id>).
 *
 * Fresh conversation: the pendente Map (module-level, StrictMode-safe
 * read-once) provides the first user bubble and the "respondendo…"
 * indicator on the FIRST frame — the bubble paints before any network or
 * persistence work. Unknown id (no pendente, no turns) → "Não encontrei
 * esta conversa". The composer is disabled while the placeholder answer is
 * in flight.
 *
 * Data seam: useChat (P8 wires the SSE stream; today it returns an empty
 * state).
 */
import { useLocalSearchParams, useRouter } from 'expo-router';
import React, { useEffect, useMemo, useRef, useState } from 'react';
import {
  Animated,
  Easing,
  FlatList,
  Pressable,
  StyleSheet,
  Text,
  TextInput,
  View,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { haptics } from '../../../lib/haptics';
import { useTheme } from '../../../theme';
import { lerPendente } from '../pendente';
import { useChat, type Turno } from './useChat';

function truncar(texto: string, maximo = 34): string {
  return texto.length > maximo ? texto.slice(0, maximo).trimEnd() + '…' : texto;
}

export default function Chat() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const router = useRouter();
  const { colors, glass, radius, spacing, typography } = useTheme();
  const insets = useSafeAreaInsets();

  // StrictMode-safe read-once: the initializer runs twice in development,
  // but lerPendente reads without consuming, so both reads agree.
  const conversaPendente = useMemo(
    () => (id ? lerPendente(id) : undefined),
    [id],
  );
  const { turns, status, send } = useChat(id, { enabled: Boolean(id) });
  const [texto, setTexto] = useState('');

  const pulso = useRef(new Animated.Value(0.4)).current;
  useEffect(() => {
    const animacao = Animated.loop(
      Animated.sequence([
        Animated.timing(pulso, {
          toValue: 1,
          duration: 600,
          easing: Easing.inOut(Easing.ease),
          useNativeDriver: true,
        }),
        Animated.timing(pulso, {
          toValue: 0.4,
          duration: 600,
          easing: Easing.inOut(Easing.ease),
          useNativeDriver: true,
        }),
      ]),
    );
    animacao.start();
    return () => animacao.stop();
  }, [pulso]);

  // While the placeholder answer is in flight (fresh conversation: the
  // question is pending and the hook has not reported a terminal state).
  const respondendo =
    status === 'respondendo' || (status === 'idle' && conversaPendente != null);

  const itens: Turno[] = useMemo(() => {
    const base: Turno[] = [];
    if (conversaPendente) {
      base.push({
        id: conversaPendente.id + ':user',
        autor: 'user',
        texto: conversaPendente.question,
      });
    }
    return [...base, ...turns];
  }, [conversaPendente, turns]);

  const jaTemResposta = itens.some((t) => t.autor === 'assistant');

  if (!id) {
    return (
      <Vazio title="Conversa" message="Não encontrei esta conversa" colors={colors} />
    );
  }

  const naoEncontrei =
    conversaPendente == null && itens.length === 0 && status === 'idle';

  return (
    <View style={{ flex: 1, backgroundColor: colors.canvas }}>
      {/* Header: title from the pending question, truncated. */}
      <View
        style={{
          backgroundColor: colors.canvas,
          borderBottomColor: colors.line,
          borderBottomWidth: StyleSheet.hairlineWidth + 1,
          flexDirection: 'row',
          alignItems: 'center',
          gap: spacing.sm,
          padding: spacing.md,
          paddingTop: insets.top + spacing.sm,
        }}
      >
        <Pressable
          onPress={() => (router.canGoBack() ? router.back() : router.replace('/'))}
          hitSlop={8}
          accessibilityLabel="Voltar"
          style={{
            alignItems: 'center',
            justifyContent: 'center',
            height: 32,
            width: 32,
          }}
        >
          <Text
            style={{
              color: colors.brand,
              fontSize: typography.lg.fontSize,
              fontWeight: '700',
            }}
          >
            ←
          </Text>
        </Pressable>
        <Text
          numberOfLines={1}
          style={{
            color: colors.foreground,
            fontSize: typography.base.fontSize,
            fontWeight: '700',
            flex: 1,
          }}
        >
          {truncar(conversaPendente?.question ?? 'Conversa')}
        </Text>
      </View>

      {naoEncontrei ? (
        <Vazio
          title="Conversa"
          message="Não encontrei esta conversa"
          colors={colors}
        />
      ) : (
        <>
          <FlatList
            data={itens}
            keyExtractor={(item) => item.id}
            contentContainerStyle={{
              padding: spacing.lg,
              gap: spacing.md,
              flexGrow: 1,
            }}
            renderItem={({ item }) => {
              const ehUsuario = item.autor === 'user';
              return (
                <View
                  style={{
                    alignItems: ehUsuario ? 'flex-end' : 'flex-start',
                    flex: 1,
                  }}
                >
                  <View
                    style={[
                      ehUsuario
                        ? {
                            backgroundColor: colors.brand,
                            borderRadius: radius.lg,
                            borderBottomRightRadius: 4,
                            padding: spacing.md,
                            maxWidth: '85%',
                          }
                        : [
                            glass.surface,
                            glass.hairline,
                            {
                              borderRadius: radius.lg,
                              borderBottomLeftRadius: 4,
                              padding: spacing.md,
                              maxWidth: '85%',
                            },
                          ],
                    ]}
                  >
                    <Text
                      style={{
                        color: ehUsuario
                          ? colors.brandForeground
                          : colors.foreground,
                        fontSize: typography.base.fontSize,
                      }}
                    >
                      {item.texto}
                    </Text>
                  </View>
                </View>
              );
            }}
            ListFooterComponent={
              respondendo && !jaTemResposta ? (
                <View
                  style={{
                    flex: 1,
                    justifyContent: 'flex-start',
                    paddingTop: spacing.md,
                  }}
                >
                  <Animated.View
                    style={[
                      glass.surface,
                      glass.hairline,
                      {
                        borderRadius: radius.lg,
                        borderBottomLeftRadius: 4,
                        opacity: pulso,
                        padding: spacing.md,
                        alignSelf: 'flex-start',
                      },
                    ]}
                  >
                    <Text
                      style={{
                        color: colors.mutedForeground,
                        fontSize: typography.sm.fontSize,
                      }}
                    >
                      respondendo…
                    </Text>
                  </Animated.View>
                </View>
              ) : null
            }
          />

          {/* Composer: disabled while the placeholder answer is in flight.
              P8 swaps the no-op send for the streaming send/stop. */}
          <View
            style={{
              backgroundColor: colors.canvas,
              borderTopColor: colors.line,
              borderTopWidth: StyleSheet.hairlineWidth + 1,
              padding: spacing.md,
              paddingBottom: Math.max(insets.bottom, spacing.md),
              gap: spacing.sm,
            }}
          >
            <View
              style={[
                glass.brand,
                glass.shadow,
                {
                  borderRadius: radius.xl,
                  flexDirection: 'row',
                  alignItems: 'flex-end',
                  gap: spacing.sm,
                  padding: spacing.sm,
                },
              ]}
            >
              <TextInput
                value={texto}
                onChangeText={setTexto}
                placeholder="Sua pergunta…"
                placeholderTextColor={colors.faintForeground}
                multiline
                editable={!respondendo}
                style={{
                  color: colors.foreground,
                  fontSize: typography.base.fontSize,
                  flex: 1,
                  maxHeight: 100,
                  paddingVertical: spacing.sm,
                }}
              />
              <Pressable
                onPress={() => {
                  const limpo = texto.trim();
                  if (!limpo || respondendo) return;
                  setTexto('');
                  void haptics.send();
                  send(limpo); // P8: streams the answer; today a documented no-op
                }}
                disabled={!texto.trim() || respondendo}
                style={({ pressed }) => [
                  {
                    alignItems: 'center',
                    backgroundColor: colors.brand,
                    borderRadius: radius.full,
                    height: 40,
                    justifyContent: 'center',
                    width: 40,
                    opacity:
                      !texto.trim() || respondendo
                        ? 0.4
                        : pressed
                          ? 0.85
                          : 1,
                  },
                ]}
                accessibilityLabel="Enviar"
              >
                <Text
                  style={{
                    color: colors.brandForeground,
                    fontSize: typography.base.fontSize,
                    fontWeight: '700',
                  }}
                >
                  ➤
                </Text>
              </Pressable>
            </View>
            {respondendo ? (
              <Text
                style={{
                  color: colors.faintForeground,
                  fontSize: typography.xs.fontSize,
                  textAlign: 'center',
                }}
              >
                Aguardando a resposta…
              </Text>
            ) : null}
          </View>
        </>
      )}
    </View>
  );
}

/** "Não encontrei esta conversa" / missing-id fallback. */
function Vazio({
  title,
  message,
  colors: c,
}: {
  title: string;
  message: string;
  colors: {
    foreground: string;
    mutedForeground: string;
    canvas: string;
  };
}) {
  const { spacing, typography } = useTheme();
  return (
    <View
      style={{
        flex: 1,
        alignItems: 'center',
        justifyContent: 'center',
        gap: spacing.sm,
        backgroundColor: c.canvas,
        padding: spacing.xl,
      }}
    >
      <Text
        style={{
          color: c.foreground,
          fontSize: typography.xl.fontSize,
          fontWeight: '700',
          textAlign: 'center',
        }}
      >
        {title}
      </Text>
      <Text
        style={{
          color: c.mutedForeground,
          fontSize: typography.sm.fontSize,
          textAlign: 'center',
        }}
      >
        {message}
      </Text>
    </View>
  );
}
