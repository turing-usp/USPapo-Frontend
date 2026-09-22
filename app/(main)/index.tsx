/**
 * Home: logo + tagline, glass composer, 3 shuffled FAQ pills (6 seeds ported
 * from the old site's lib/perguntas.ts, QUANTAS_EXIBIR = 3, shuffle once per
 * launch) and the "Continuar de onde parou" section (P9: the last 3 cached
 * conversations from the offline store — tappable, renders offline).
 *
 * Send flow: haptics.send() → id (crypto.randomUUID on web, native fallback)
 * → store {id, question, enqueuedAt} in the module-level pendente Map AND
 * queue.enqueue via lib/net when offline → navigate to the chat route.
 * The AUTHORITATIVE enqueue happens at the actual fetch failure in
 * useChat (the queue de-duplicates by conversationId); the badge below the
 * composer shows the pending count ("N perguntas aguardando a conexão").
 */
import { useRouter } from 'expo-router';
import React, { useEffect, useState } from 'react';
import {
  ScrollView,
  Text,
  View,
  useWindowDimensions,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { LogoMark, LogoUSPapo } from '../../components/BrandMarks';
import Composer from '../../components/Composer';
import Glass from '../../components/Glass';
import Container from '../../components/Container';
import { ALTURA_CHROME } from '../../components/Chrome';
import { ultimasConversasOffline } from '../../lib/cache';
import { haptics } from '../../lib/haptics';
import * as net from '../../lib/net';
import { quandoConectar } from '../../lib/offline';
import { supabase } from '../../lib/supabase';
import { useAlturaDoTeclado } from '../../lib/teclado';
import { lerHistorico, type Conversa } from '../../lib/conversations';
import { useTheme } from '../../theme';
import { guardarPendente } from './pendente';

/* FAQ seeds — port of the old site's lib/perguntas.ts (trecho for the pill,
   prompt for the bubble/backend). Show 3 of the 6 per launch. */
type PerguntaFrequente = { trecho: string; prompt: string };

const PERGUNTAS_FREQUENTES: PerguntaFrequente[] = [
  {
    trecho: 'Cardápio de hoje?',
    prompt:
      'Qual é o cardápio de hoje nos bandejões do Butantã, no almoço e no jantar?',
  },
  {
    trecho: 'Tem choque de horário?',
    prompt:
      'Quais são as turmas de MAC0110 e MAT2454 neste semestre, e existe choque de horário entre elas?',
  },
  {
    trecho: 'O que se estuda em Engenharia de Computação?',
    prompt:
      'Quais são as disciplinas obrigatórias do primeiro semestre de Engenharia de Computação na Poli?',
  },
  {
    trecho: 'Como funciona uma disciplina?',
    prompt:
      'Qual é a ementa de MAC2166, quantos créditos ela vale e quais são os requisitos para cursá-la?',
  },
  {
    trecho: 'O que é o Jupiterweb?',
    prompt: 'O que é o JupiterWeb e para que um aluno da USP usa esse sistema?',
  },
  {
    trecho: 'Quanto dura o curso de Direito?',
    prompt:
      'Quantos semestres dura o curso de Direito na USP e quais disciplinas se cursa em cada um?',
  },
];

const QUANTAS_EXIBIR = 3;

/** Partial Fisher-Yates on a copy — port of the old site's `sortear`. */
function sortearPerguntas(): PerguntaFrequente[] {
  const copia = [...PERGUNTAS_FREQUENTES];
  const total = Math.min(QUANTAS_EXIBIR, copia.length);
  for (let i = 0; i < total; i++) {
    const j = i + Math.floor(Math.random() * (copia.length - i));
    [copia[i], copia[j]] = [copia[j], copia[i]];
  }
  return copia.slice(0, total);
}

/** crypto.randomUUID (web) with a native v4-style fallback. */
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

export default function Inicio() {
  const { colors, fonts, glass, radius, spacing, typography } = useTheme();
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const { width: largura } = useWindowDimensions();
  const alturaTeclado = useAlturaDoTeclado();

  const [pergunta, setPergunta] = useState('');
  const [perguntas, setPerguntas] = useState<PerguntaFrequente[]>([]);
  /** The last 3 cached conversations ("Continuar de onde parou"). */
  const [ultimas, setUltimas] = useState<Conversa[]>([]);
  /** Pending questions in the offline queue (the composer badge). */
  const [naFila, setNaFila] = useState(0);
  const { online } = net.useConnection();

  // Reshuffled on every visit, like the old site (its client component
  // re-runs the shuffle in a mount effect) — a module-level memo froze the
  // same three for the whole session.
  useEffect(() => {
    setPerguntas(sortearPerguntas());
  }, []);

  // "Continuar de onde parou": the OFFLINE CACHE first (no network needed),
  // and the SERVER when the cache has nothing to offer.
  //
  // Cache-only was the original P9 design, and it is wrong the moment the
  // cache is not there: on web it is an expo-sqlite WASM build that a strict
  // CSP or a private window can refuse, and on a fresh install it is simply
  // empty — so the card was permanently missing for people who had a full
  // history on the server. The cache still wins when it answers: it is the
  // last state the student actually saw, and it costs no round trip.
  useEffect(() => {
    let ativo = true;
    (async () => {
      let userId = '';
      try {
        const { data } = await supabase.auth.getSession();
        userId = data.session?.user?.id ?? '';
      } catch {
        userId = '';
      }
      if (!userId || !ativo) return;

      let recentes: Conversa[] = [];
      try {
        recentes = await ultimasConversasOffline(userId, 3);
      } catch (err) {
        console.warn('[inicio] cache offline indisponível:', err);
      }
      if (recentes.length === 0) {
        try {
          recentes = (await lerHistorico(userId, 3)).slice(0, 3);
        } catch (err) {
          console.warn('[inicio] histórico do servidor indisponível:', err);
        }
      }
      if (ativo) setUltimas(recentes);
    })();
    const atualizarFila = (): void => {
      net
        .filaPendente()
        .then((itens) => {
          if (ativo) setNaFila(itens.length);
        })
        .catch(() => undefined);
    };
    atualizarFila();
    const cancelar = quandoConectar(atualizarFila);
    return () => {
      ativo = false;
      cancelar();
    };
  }, []);

  function iniciarConversa(texto: string) {
    const limpo = texto.trim();
    if (!limpo) return;
    const id = novoId();
    const agora = Date.now();
    guardarPendente({ id, question: limpo, enqueuedAt: agora });

    // Offline: park the question in the lib/net queue (visible state, fired
    // on reconnect — the composer badge is P8). Imported defensively: the
    // app still works if the queue API is missing/changed.
    const fila = net.queue;
    if (!online && fila && typeof fila.enqueue === 'function') {
      void fila
        .enqueue({
          id,
          conversationId: id,
          question: limpo,
          enqueuedAt: agora,
        })
        .catch(() => undefined)
        .then(() => {
          // The badge is honest immediately (the replay may drain it later;
          // quandoConectar refreshes it then).
          net.filaPendente().then((itens) => setNaFila(itens.length)).catch(() => undefined);
        });
    }

    setPergunta('');
    void haptics.send();
    router.push(`/(main)/chat/${id}`);
  }

  const larguraPills = largura >= 768;

  return (
    <ScrollView
      contentContainerStyle={{
        // The old home is `flex min-h-full flex-col` with the hero block as
        // `flex-1 justify-center`: the content sits VERTICALLY CENTRED and the
        // credit line is pushed to the bottom. It is not top-aligned.
        flexGrow: 1,
        paddingTop: insets.top + ALTURA_CHROME,
        // The keyboard covers the app under edge-to-edge instead of
        // resizing the window (see lib/teclado): without this the composer
        // ends up underneath it.
        paddingBottom: insets.bottom + spacing.lg + alturaTeclado,
      }}
      keyboardShouldPersistTaps="handled"
    >
      <View style={{ flex: 1, justifyContent: 'center', paddingVertical: 32 }}>
        {/* Hero: mark + wordmark, then the tagline (old `app-container flex
            flex-col items-center`). */}
        <Container style={{ alignItems: 'center' }}>
          <View
            style={{
              alignItems: 'center',
              flexDirection: larguraPills ? 'row' : 'column',
              gap: spacing.sm,
              justifyContent: 'center',
              marginBottom: spacing.md,
            }}
          >
            <LogoUSPapo size={40} />
            <Text
              style={{
                color: colors.brand,
                fontFamily: fonts.display,
                fontSize: larguraPills ? 48 : 36,
                marginLeft: 4,
              }}
            >
              USPapo
            </Text>
          </View>
          <Text
            style={{
              color: colors.foreground,
              fontFamily: fonts.display,
              fontSize: larguraPills
                ? typography.xl.fontSize
                : typography.base.fontSize,
              marginTop: spacing.md,
              marginBottom: spacing['2xl'],
              textAlign: 'center',
            }}
          >
            Seu <Text style={{ color: colors.brand }}>assistente inteligente</Text>
            {' '}para navegar pela USP
          </Text>
        </Container>

      <Container>
        <Composer
          value={pergunta}
          onChange={setPergunta}
          onSubmit={iniciarConversa}
        />

        {/* Offline queue badge — honest about what is waiting to send. */}
        {naFila > 0 ? (
          <Glass
            radius={radius.full}
            style={{
              alignSelf: 'flex-start',
              marginTop: spacing.md,
              paddingVertical: 6,
              paddingHorizontal: 12,
            }}
          >
            <Text
              style={{
                color: colors.mutedForeground,
                fontFamily: fonts.body,
                fontSize: typography.xs.fontSize,
              }}
            >
              {naFila === 1
                ? '1 pergunta aguardando a conexão'
                : `${naFila} perguntas aguardando a conexão`}
            </Text>
          </Glass>
        ) : null}
      </Container>

      {/* "Perguntas Frequentes": 3 of 6, shuffled once per launch. */}
      <Container
        style={{
          alignItems: 'center',
          marginTop: larguraPills ? 48 : 40,
        }}
      >
        <Text
          style={{
            color: colors.foreground,
            fontFamily: fonts.display,
            fontSize: typography.base.fontSize,
          }}
        >
          Perguntas Frequentes
        </Text>

        <View
          style={{
            alignItems: 'stretch',
            flexDirection: larguraPills ? 'row' : 'column',
            flexWrap: larguraPills ? 'wrap' : 'nowrap',
            gap: larguraPills ? 24 : 16,
            justifyContent: 'center',
            marginTop: 24,
            width: '100%',
          }}
        >
          {perguntas.map((p) => (
            <Glass
              key={p.trecho}
              onPress={() => iniciarConversa(p.prompt)}
              radius={32}
              style={{
                alignItems: 'center',
                alignSelf: 'center',
                // Old pill: h-14, rounded-[2rem], max-w-[18rem], and on a
                // wide window an equal-basis row item with an 11rem floor.
                flexBasis: larguraPills ? 0 : 'auto',
                flexGrow: larguraPills ? 1 : 0,
                height: 56,
                justifyContent: 'center',
                maxWidth: 288,
                minWidth: larguraPills ? 176 : undefined,
                paddingHorizontal: spacing.lg,
                paddingVertical: spacing.sm,
                width: larguraPills ? undefined : '100%',
              }}
            >
              <Text
                style={{
                  color: colors.foreground,
                  fontFamily: fonts.body,
                  fontSize: typography.base.fontSize,
                  textAlign: 'center',
                }}
              >
                {p.trecho}
              </Text>
            </Glass>
          ))}
        </View>
      </Container>

      {/* "Continuar de onde parou" — the last 3 cached conversations, read
          from the offline store so the section renders with no network.
          Hidden entirely when there is nothing to resume, which keeps the
          old site's empty home intact on a first run. */}
      {ultimas.length > 0 ? (
        <Container style={{ marginTop: 48 }}>
          <Text
            style={{
              color: colors.mutedForeground,
              fontFamily: fonts.display,
              fontSize: typography.sm.fontSize,
              marginBottom: spacing.md,
            }}
          >
            Continuar de onde parou
          </Text>
          <View style={{ gap: spacing.md }}>
            {ultimas.map((c) => (
              <Glass
                key={c.id}
                onPress={() => router.push(`/(main)/chat/${c.id}`)}
                radius={radius.lg}
                style={{
                  paddingVertical: spacing.md,
                  paddingHorizontal: spacing.lg,
                }}
              >
                <View
                  style={{
                    alignItems: 'center',
                    flexDirection: 'row',
                    gap: spacing.sm,
                  }}
                >
                  <Text
                    numberOfLines={1}
                    style={{
                      color: colors.foreground,
                      flex: 1,
                      fontFamily: fonts.body,
                      fontSize: typography.base.fontSize,
                    }}
                  >
                    {c.pergunta}
                  </Text>
                  {c.resposta === null ? (
                    <Text
                      style={{
                        color: colors.danger,
                        fontFamily: fonts.bodyBold,
                        fontSize: typography.xs.fontSize,
                      }}
                    >
                      pendente
                    </Text>
                  ) : null}
                </View>
              </Glass>
            ))}
          </View>
        </Container>
      ) : null}
      </View>

      {/* Credit line, pinned under the centred block (old `py-6` row). */}
      <Container
        style={{
          alignItems: 'center',
          flexDirection: 'row',
          flexWrap: 'wrap',
          gap: spacing.sm,
          justifyContent: 'center',
          paddingVertical: spacing['2xl'],
        }}
      >
        <Text
          style={{
            color: colors.brand,
            fontFamily: fonts.display,
            fontSize: typography.base.fontSize,
          }}
        >
          Desenvolvido por
        </Text>
        <View style={{ alignItems: 'center', flexDirection: 'row', gap: 4 }}>
          <LogoMark size={30} />
          <Text
            style={{
              color: colors.brand,
              // The one place the old site uses Orbitron.
              fontFamily: fonts.accent,
              fontSize: typography.base.fontSize,
            }}
          >
            turing.usp
          </Text>
        </View>
      </Container>
    </ScrollView>
  );
}
