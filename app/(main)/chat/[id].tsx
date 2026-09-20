/**
 * Conversation screen (deep-linkable: usapo://chat/<id> /
 * https://uspapo.turingusp.com/chat/<id>).
 *
 * Fresh conversation: the pendente Map (module-level, StrictMode-safe
 * read-once, read inside the hook's useState initializers) seeds the first
 * user bubble and the "respondendo…" indicator on the FIRST frame — the
 * bubble paints before any network or persistence work. Unknown id (no
 * pendente, no loaded row) → "Não encontrei esta conversa".
 *
 * Streaming (P8, useChat): incremental assistant text, the compact
 * tool-status lines (label + pulse while start..end, ✓ + results count on
 * end), the "Fontes consultadas" row with tappable URLs, the like/dislike
 * row under completed answers, and the 429 / 401 handling (401 fast-fails
 * to login via aoSessaoExpirada). The composer send button becomes Stop
 * while 'respondendo'; Stop aborts the stream and the pending row stays
 * pending (P9).
 *
 * A question asked AFTER the answer completed starts a NEW conversation
 * (the row model is one-per-conversation): the screen stores it in the
 * pendente Map and navigates, exactly like the home screen — the previous
 * turns travel with the next request in the `historico` wire field.
 */
import { useLocalSearchParams, useRouter } from 'expo-router';
import React, { useEffect, useMemo, useRef, useState } from 'react';
import {
  Animated,
  Easing,
  FlatList,
  NativeSyntheticEvent,
  Pressable,
  Text,
  TextInput,
  View,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import Backdrop from '../../../components/Backdrop';
import { BolhaAssistente, BolhaUsuario, LinhaErro, LinhaFerramenta, LinhaNota } from '../../../components/chat/bolhas';
import { FeedbackResposta } from '../../../components/chat/feedback';
import { haptics } from '../../../lib/haptics';
import { useTheme } from '../../../theme';
import { guardarPendente } from '../pendente';
import { useChat } from './useChat';

function truncar(texto: string, maximo = 34): string {
  return texto.length > maximo ? texto.slice(0, maximo).trimEnd() + '…' : texto;
}

/** Once per screen; the home screen has the same generator (the module
 *  scope there is not importable without coupling the routes). */
function novoId(): string {
  const crypto = (
    globalThis as { crypto?: { randomUUID?: () => string } }
  ).crypto;
  if (crypto && typeof crypto.randomUUID === 'function') {
    return crypto.randomUUID();
  }
  return 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, (letra) => {
    const r = (Math.random() * 16) | 0;
    const v = letra === 'x' ? r : (r & 0x3) | 0x8;
    return v.toString(16);
  });
}

export default function Chat() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const router = useRouter();
  const { colors, glass, radius, spacing, typography } = useTheme();
  const insets = useSafeAreaInsets();

  const listaRef = useRef<FlatList>(null);
  /** Near the bottom? (drives the auto-scroll and the finished haptic). */
  const pertoDoFimRef = useRef(true);

  const { turns, status, pergunta, erro, concluido, carregou, favorita, userId, send, stop } =
    useChat(id, {
      enabled: Boolean(id),
      // The 401 / no-token fast-fail: straight to login.
      aoSessaoExpirada: () => router.replace('/(auth)/login'),
      pertoDoFim: () => pertoDoFimRef.current,
    });

  const [texto, setTexto] = useState('');

  const pulso = useRef(new Animated.Value(0.3)).current;
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
          toValue: 0.3,
          duration: 600,
          easing: Easing.inOut(Easing.ease),
          useNativeDriver: true,
        }),
      ]),
    );
    animacao.start();
    return () => animacao.stop();
  }, [pulso]);

  // Auto-scroll: follow the stream only while the user is near the bottom
  // (the old site's scrollIntoView, adapted to FlatList).
  useEffect(() => {
    if (pertoDoFimRef.current) {
      listaRef.current?.scrollToEnd({ animated: status !== 'respondendo' });
    }
  }, [turns, status]);

  const titulo = useMemo(() => {
    const primeiro = turns.find((t) => t.autor === 'user');
    return primeiro && primeiro.autor === 'user' ? primeiro.texto : 'Conversa';
  }, [turns]);

  // The thinking indicator shows only in the pure thinking phase (no text
  // and no tool line yet); after that the tool lines / growing text are the
  // feedback (ported from the old site's statusVisivel rule).
  const fasePensando =
    status === 'respondendo' &&
    !turns.some(
      (t) => (t.autor === 'assistant' && t.texto !== '') || t.autor === 'ferramenta',
    );

  const respondendo = status === 'respondendo';

  const aoRolar = (e: NativeSyntheticEvent<{ contentOffset: { x: number; y: number }; contentSize: { width: number; height: number }; layoutMeasurement: { width: number; height: number } }>) => {
    const { contentOffset, contentSize, layoutMeasurement } = e.nativeEvent;
    const distanciaDoFim = contentSize.height - contentOffset.y - layoutMeasurement.height;
    pertoDoFimRef.current = distanciaDoFim < 320;
  };

  const enviar = () => {
    const limpo = texto.trim();
    if (!limpo || !id) return;
    if (respondendo) {
      stop();
      return;
    }
    if (concluido || (pergunta != null && limpo !== pergunta)) {
      // A new question → a new conversation (one row per conversation);
      // the context of the previous turns travels via the historico wire.
      const novoIdConversa = novoId();
      guardarPendente({ id: novoIdConversa, question: limpo, enqueuedAt: Date.now() });
      setTexto('');
      void haptics.send();
      router.push(`/(main)/chat/${novoIdConversa}`);
      return;
    }
    // The same pending question: the first send (composer path) or the
    // retry after an error — the pending row already exists, no re-insert.
    setTexto('');
    send(limpo);
  };

  const aoTentarDeNovo = () => {
    if (pergunta != null) send(pergunta);
  };

  if (!id) {
    return (
      <View style={{ flex: 1 }}>
        <Backdrop />
        <Vazio title="Conversa" message="Não encontrei esta conversa" colors={colors} />
      </View>
    );
  }

  const naoEncontrei =
    carregou && turns.length === 0 && status === 'idle';

  return (
    <View style={{ flex: 1 }}>
      {/* Screen-level canvas fill moved to the backdrop (old page backdrop). */}
      <Backdrop />
      {/* Header: title from the first user turn, truncated. */}
      <View
        style={[
          glass.raised,
          {
            borderBottomColor: glass.hairline.borderColor,
            borderBottomWidth: glass.hairline.borderWidth ?? 1,
            flexDirection: 'row',
            alignItems: 'center',
            gap: spacing.sm,
            padding: spacing.md,
            paddingTop: insets.top + spacing.sm,
          },
        ]}
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
          {truncar(titulo)}
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
            ref={listaRef}
            data={turns}
            keyExtractor={(item) => item.id}
            onScroll={aoRolar}
            scrollEventThrottle={16}
            contentContainerStyle={{
              padding: spacing.lg,
              gap: spacing.md,
              flexGrow: 1,
            }}
            renderItem={({ item }) => {
              switch (item.autor) {
                case 'user':
                  return <BolhaUsuario texto={item.texto} />;

                case 'assistant':
                  return (
                    <BolhaAssistente turno={item}>
                      {item.completo && status !== 'respondendo' && userId ? (
                        <FeedbackResposta
                          userId={userId}
                          conversaId={id}
                          inicial={favorita}
                        />
                      ) : null}
                    </BolhaAssistente>
                  );

                case 'ferramenta':
                  return <LinhaFerramenta turno={item} pulso={pulso} />;

                case 'erro':
                  return (
                    <LinhaErro
                      turno={item}
                      aoTentar={aoTentarDeNovo}
                      podeTentar={!respondendo}
                    />
                  );

                case 'nota':
                  return <LinhaNota texto={item.texto} />;

                default:
                  return null;
              }
            }}
            ListFooterComponent={
              fasePensando ? (
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

          {/* Composer: send/stop. While 'respondendo' the button is Stop
              (aborting the stream keeps the pending row pending — P9). */}
          <View
            style={{
              // Canvas fill goes to the backdrop; the old solid line border
              // softens to the glass hairline token.
              borderTopColor: glass.hairline.borderColor,
              borderTopWidth: glass.hairline.borderWidth ?? 1,
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
                onPress={enviar}
                disabled={!texto.trim() && !respondendo}
                style={({ pressed }) => [
                  {
                    alignItems: 'center',
                    backgroundColor: respondendo ? colors.danger : colors.brand,
                    borderRadius: radius.full,
                    height: 40,
                    justifyContent: 'center',
                    width: 40,
                    opacity:
                      !texto.trim() && !respondendo
                        ? 0.4
                        : pressed
                          ? 0.85
                          : 1,
                  },
                ]}
                accessibilityLabel={respondendo ? 'Parar' : 'Enviar'}
              >
                <Text
                  style={{
                    color: colors.brandForeground,
                    fontSize: typography.base.fontSize,
                    fontWeight: '700',
                  }}
                >
                  {respondendo ? '■' : '➤'}
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
            ) : erro ? (
              <Text
                style={{
                  color: colors.faintForeground,
                  fontSize: typography.xs.fontSize,
                  textAlign: 'center',
                }}
              >
                {erro.tipo === 'sessao'
                  ? 'Sua sessão expirou'
                  : 'Tente de novo, ou faça outra pergunta acima.'}
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
