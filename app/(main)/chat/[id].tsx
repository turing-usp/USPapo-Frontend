/**
 * Conversation screen (deep-linkable: usapo://chat/<id> /
 * https://uspapo.turingusp.com/chat/<id>).
 *
 * Fresh conversation: the pendente Map (module-level, StrictMode-safe
 * read-once, read inside the hook's useState initializers) seeds the first
 * user bubble and the reasoning tag on the FIRST frame — the bubble paints
 * before any network or persistence work. Unknown id (no pendente, no saved
 * conversation) → "Não encontrei esta conversa".
 *
 * Streaming (useChat): incremental assistant text rendered as MARKDOWN and
 * revealed at a steady pace (components/chat/Resposta), the status tags
 * (components/chat/bolhas.Etiqueta — ONE shape for the reasoning tag and the
 * tool tags: pulse + label + what was consulted, ✓ + results count on end),
 * the "Fontes consultadas" row with tappable URLs, the like/dislike row under
 * each completed answer, and the 429 / 401 handling (401 fast-fails to login
 * via aoSessaoExpirada). The composer send button becomes Stop while
 * 'respondendo'; Stop aborts the stream and the pending turn stays pending
 * (P9).
 *
 * MULTI-TURN: a follow-up asked after the answer completed is a NEW TURN OF
 * THIS CONVERSATION — `send` appends it, the earlier turns stay on screen
 * and travel with the request in the `historico` wire field. (It used to
 * navigate to a brand-new conversation, which is why the previous turns
 * vanished from the screen the moment a second question was asked.)
 *
 * Keyboard: the composer is padded by the keyboard's height (lib/teclado),
 * because edge-to-edge Android no longer resizes the window for the IME and
 * the input was ending up underneath it.
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
import Container from '../../../components/Container';
import {
  BolhaAssistente,
  BolhaUsuario,
  LinhaErro,
  LinhaFerramenta,
  LinhaNota,
  LinhaRaciocinio,
  RaciocinioImplicito,
} from '../../../components/chat/bolhas';
import { FeedbackResposta } from '../../../components/chat/feedback';
import { lerFeedbacksDaConversa, type Feedback } from '../../../lib/feedback';
import { useAlturaDoTeclado } from '../../../lib/teclado';
import { fonts, useTheme } from '../../../theme';
import { turnoAtual, useChat } from './useChat';

/**
 * The AI disclaimer under the composer (the old site prints the same line
 * under its PromptInput). It is the RESTING state of the status slot: the
 * transient "Aguardando a resposta…" and the error hint take the line while
 * they apply, and it comes back when neither does.
 */
const AVISO_IA =
  'O USPapo é uma IA e pode cometer erros. Sempre verifique as respostas.';

export default function Chat() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const router = useRouter();
  const { colors, layout, spacing, typography } = useTheme();
  const insets = useSafeAreaInsets();
  const { width: largura } = useWindowDimensions();
  const alturaTeclado = useAlturaDoTeclado();

  const listaRef = useRef<FlatList>(null);
  /** Near the bottom? (drives the auto-scroll and the finished haptic). */
  const pertoDoFimRef = useRef(true);

  const {
    turns,
    status,
    pergunta,
    erro,
    concluido,
    escrevendo,
    carregou,
    userId,
    send,
    stop,
  } = useChat(id, {
      enabled: Boolean(id),
      // The 401 / no-token fast-fail: straight to login.
      aoSessaoExpirada: () => router.replace('/(auth)/login'),
      pertoDoFim: () => pertoDoFimRef.current,
    });

  const [texto, setTexto] = useState('');
  /** The ratings already stored in this conversation, by `mensagem_ordem`. */
  const [feedbacks, setFeedbacks] = useState<Record<number, Feedback>>({});
  /** Composer height, so the bottom dissolve starts right above it. */
  const [alturaComposer, setAlturaComposer] = useState(0);

  useEffect(() => {
    if (!userId || !id) return;
    let ativo = true;
    // All of them in one query: a conversation has many answers, and one
    // read per answer would be one round trip per turn.
    void lerFeedbacksDaConversa({ userId, conversaId: id }).then((f) => {
      if (ativo) setFeedbacks(f);
    });
    return () => {
      ativo = false;
    };
  }, [userId, id, concluido]);

  // `useState(fn)[0]` rather than a ref: the value is read during render (it
  // is handed to the tool lines and the thinking pill), which is exactly what
  // a ref is not for.
  const [pulso] = useState(() => new Animated.Value(0.3));
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
  // (the old site's scrollIntoView, adapted to FlatList). The keyboard is a
  // dependency too: opening it shortens the list, and the last turn has to
  // stay in view instead of sliding under the composer.
  useEffect(() => {
    if (pertoDoFimRef.current) {
      listaRef.current?.scrollToEnd({ animated: status !== 'respondendo' });
    }
  }, [turns, status, alturaTeclado]);

  const respondendo = status === 'respondendo';

  /**
   * Is the reasoning tag the current state?
   *
   * It used to be a footer card ("respondendo…") that showed ONLY before the
   * first tool line — so the moment the model called a tool it disappeared for
   * good, and the long gap between a tool answering and the first token of the
   * answer looked like the app had stalled. The honest rule is simply: the
   * stream is open and the model is not writing the answer yet. That holds
   * before the first tool AND between tools AND after the last one.
   *
   * When the provider actually SENDS reasoning tokens the tag is already a
   * line of the list (`autor: 'raciocinio'`), so this footer only fills the
   * stretches where it reports nothing — never both at once.
   */
  const atual = turnoAtual(turns);
  const raciocinioAberto = atual.some(
    (t) => t.autor === 'raciocinio' && !t.pronta,
  );
  const raciocinando = respondendo && !escrevendo && !raciocinioAberto;

  /**
   * Which answer each assistant line is, counting from the top. It is the
   * `mensagens.ordem` of that turn, and the key the feedback rows are stored
   * under — so the 👍 on the third answer is the third answer's.
   */
  const ordemDoTurno = new Map<string, number>();
  let contagem = 0;
  for (const t of turns) {
    if (t.autor === 'assistant') {
      ordemDoTurno.set(t.id, contagem);
      contagem += 1;
    }
  }

  const aoRolar = (e: NativeSyntheticEvent<{ contentOffset: { x: number; y: number }; contentSize: { width: number; height: number }; layoutMeasurement: { width: number; height: number } }>) => {
    const { contentOffset, contentSize, layoutMeasurement } = e.nativeEvent;
    const distanciaDoFim = contentSize.height - contentOffset.y - layoutMeasurement.height;
    pertoDoFimRef.current = distanciaDoFim < 320;
  };

  const enviar = () => {
    if (respondendo) {
      stop();
      return;
    }
    const limpo = texto.trim();
    if (!limpo || !id) return;
    // Every question — the first one, a retry, a follow-up — goes through
    // the same call: the hook decides whether it completes the pending turn
    // or appends the next one.
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
            keyboardShouldPersistTaps="handled"
            keyboardDismissMode="interactive"
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

                case 'assistant': {
                  const ordem = ordemDoTurno.get(item.id) ?? 0;
                  return (
                    <BolhaAssistente turno={item}>
                      {item.completo && userId ? (
                        <FeedbackResposta
                          userId={userId}
                          conversaId={id}
                          mensagemOrdem={ordem}
                          inicial={feedbacks[ordem] ?? null}
                        />
                      ) : null}
                    </BolhaAssistente>
                  );
                }

                case 'raciocinio':
                  return <LinhaRaciocinio turno={item} pulso={pulso} />;

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
              raciocinando ? (
                <View style={{ paddingTop: spacing.md }}>
                  <RaciocinioImplicito pulso={pulso} />
                </View>
              ) : null
            }
          />

          {/* The edge dissolve (old `page-fade-b` / `page-fade-t`): the scene
              repainted over the list, solid under the chrome and behind the
              composer, fading out into the message area. */}
          <BackdropDesvanecido lado="topo" solido={insets.top + ALTURA_CHROME} />
          {/* `alturaComposer` is the MEASURED height of the composer block,
              and that block already pads itself by the keyboard height — so
              adding the keyboard again put the dissolve a whole keyboard
              above the input, with a band of solid backdrop floating over
              the conversation. */}
          <BackdropDesvanecido lado="base" solido={alturaComposer} />

          {/* Composer — the shared one, in its Stop state while streaming
              (aborting keeps the pending turn pending — P9). */}
          <View
            onLayout={(e) => setAlturaComposer(e.nativeEvent.layout.height)}
            style={{
              // The keyboard's height rides on top of the safe-area inset:
              // under edge-to-edge the window does not shrink for the IME,
              // so without this the composer stays underneath it.
              paddingBottom: Math.max(insets.bottom, spacing.md) + alturaTeclado,
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
