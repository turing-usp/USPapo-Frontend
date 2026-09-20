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
import React, { useEffect, useRef, useState } from 'react';
import {
  Animated,
  Easing,
  FlatList,
  NativeSyntheticEvent,
  Text,
  View,
  useWindowDimensions,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { ALTURA_CHROME } from '../../../components/Chrome';
import { BackdropDesvanecido } from '../../../components/Backdrop';
import Composer from '../../../components/Composer';
import Glass from '../../../components/Glass';
import Container from '../../../components/Container';
import { BolhaAssistente, BolhaUsuario, LinhaErro, LinhaFerramenta, LinhaNota } from '../../../components/chat/bolhas';
import { FeedbackResposta } from '../../../components/chat/feedback';
import { lerFeedback, type Feedback } from '../../../lib/feedback';
import { haptics } from '../../../lib/haptics';
import { fonts, useTheme } from '../../../theme';
import { guardarPendente } from '../pendente';
import { useChat } from './useChat';

/**
 * The AI disclaimer under the composer (the old site prints the same line
 * under its PromptInput). It is the RESTING state of the status slot: the
 * transient "Aguardando a resposta…" and the error hint take the line while
 * they apply, and it comes back when neither does.
 */
const AVISO_IA =
  'O USPapo é uma IA e pode cometer erros. Sempre verifique as respostas.';

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
  const { colors, layout, radius, spacing, typography } = useTheme();
  const insets = useSafeAreaInsets();
  const { width: largura } = useWindowDimensions();

  const listaRef = useRef<FlatList>(null);
  /** Near the bottom? (drives the auto-scroll and the finished haptic). */
  const pertoDoFimRef = useRef(true);

  const { turns, status, pergunta, erro, concluido, carregou, userId, send, stop } =
    useChat(id, {
      enabled: Boolean(id),
      // The 401 / no-token fast-fail: straight to login.
      aoSessaoExpirada: () => router.replace('/(auth)/login'),
      pertoDoFim: () => pertoDoFimRef.current,
    });

  const [texto, setTexto] = useState('');
  /** The rating already stored for this answer (null = none yet). */
  const [feedback, setFeedback] = useState<Feedback | null>(null);
  /** Composer height, so the bottom dissolve starts right above it. */
  const [alturaComposer, setAlturaComposer] = useState(0);

  useEffect(() => {
    if (!userId || !id) return;
    let ativo = true;
    void lerFeedback({ userId, conversaId: id }).then((f) => {
      if (ativo) setFeedback(f);
    });
    return () => {
      ativo = false;
    };
  }, [userId, id]);

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
        <Vazio title="Conversa" message="Não encontrei esta conversa" colors={colors} />
      </View>
    );
  }

  const naoEncontrei =
    carregou && turns.length === 0 && status === 'idle';

  return (
    <View style={{ flex: 1 }}>
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
              // .app-container-chat: 48rem measure, centred, with the old
              // `pt-8` clearing the floating chrome.
              alignSelf: 'center',
              flexGrow: 1,
              gap: spacing.lg,
              maxWidth: layout.chatMaxWidth,
              paddingBottom: spacing.lg,
              paddingHorizontal: layout.gutter(largura),
              paddingTop: insets.top + ALTURA_CHROME + spacing['2xl'],
              width: '100%',
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
                          inicial={feedback}
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
                    style={{ alignSelf: 'flex-start', opacity: pulso }}
                  >
                    <Glass radius={radius.lg} style={{ padding: spacing.md }}>
                    <Text
                      style={{
                        color: colors.mutedForeground,
                        fontFamily: fonts.body,
                        fontSize: typography.sm.fontSize,
                      }}
                    >
                      respondendo…
                    </Text>
                    </Glass>
                  </Animated.View>
                </View>
              ) : null
            }
          />

          {/* The edge dissolve (old `page-fade-b` / `page-fade-t`): the scene
              repainted over the list, solid under the chrome and behind the
              composer, fading out into the message area. */}
          <BackdropDesvanecido lado="topo" solido={insets.top + ALTURA_CHROME} />
          <BackdropDesvanecido lado="base" solido={alturaComposer} />

          {/* Composer — the shared one, in its Stop state while streaming
              (aborting keeps the pending row pending — P9). */}
          <View
            onLayout={(e) => setAlturaComposer(e.nativeEvent.layout.height)}
            style={{
              paddingBottom: Math.max(insets.bottom, spacing.md),
              paddingTop: spacing.md,
              gap: spacing.sm,
              // Above the dissolve overlays: they are absolutely positioned,
              // and on web a positioned box paints over a static sibling
              // whatever the order, which would veil the composer itself.
              zIndex: 1,
            }}
          >
            <Container chat>
              <Composer
                value={texto}
                onChange={setTexto}
                onSubmit={enviar}
                placeholder="Pergunte sobre a USP"
                respondendo={respondendo}
                onStop={enviar}
              />
            </Container>
            {respondendo ? (
              <Text
                style={{
                  color: colors.faintForeground,
                  fontFamily: fonts.body,
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
                  fontFamily: fonts.body,
                  fontSize: typography.xs.fontSize,
                  textAlign: 'center',
                }}
              >
                {erro.tipo === 'sessao'
                  ? 'Sua sessão expirou'
                  : 'Tente de novo, ou faça outra pergunta acima.'}
              </Text>
            ) : (
              <Text
                style={{
                  color: colors.faintForeground,
                  fontFamily: fonts.body,
                  fontSize: typography.xs.fontSize,
                  textAlign: 'center',
                }}
              >
                {AVISO_IA}
              </Text>
            )}
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
          fontFamily: fonts.displayBold,
          fontSize: typography.xl.fontSize,
          textAlign: 'center',
        }}
      >
        {title}
      </Text>
      <Text
        style={{
          color: c.mutedForeground,
          fontFamily: fonts.body,
          fontSize: typography.sm.fontSize,
          textAlign: 'center',
        }}
      >
        {message}
      </Text>
    </View>
  );
}
