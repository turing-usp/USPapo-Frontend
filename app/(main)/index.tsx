/**
 * Home: logo + tagline, glass composer, 3 shuffled FAQ pills (6 seeds ported
 * from the old site's lib/perguntas.ts, QUANTAS_EXIBIR = 3, shuffle once per
 * launch) and the "Continuar de onde parou" placeholder section (P9).
 *
 * Send flow: haptics.send() → id (crypto.randomUUID on web, native fallback)
 * → store {id, question, enqueuedAt} in the module-level pendente Map AND
 * queue.enqueue via lib/net when offline → navigate to the chat route.
 */
import { useRouter } from 'expo-router';
import React, { useEffect, useState } from 'react';
import {
  Image,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { haptics } from '../../lib/haptics';
import * as net from '../../lib/net';
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

/** Once per launch (module-level memo, set inside the effect below). */
let sorteadasNesteLancamento: PerguntaFrequente[] | null = null;

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
  const { colors, glass, radius, spacing, typography } = useTheme();
  const router = useRouter();
  const insets = useSafeAreaInsets();

  const [pergunta, setPergunta] = useState('');
  const [perguntas, setPerguntas] = useState<PerguntaFrequente[]>([]);
  const { online } = net.useConnection();

  // Shuffle once per launch (module-level memo so a tab remount keeps the
  // same 3 for the whole session).
  useEffect(() => {
    if (!sorteadasNesteLancamento) {
      sorteadasNesteLancamento = sortearPerguntas();
    }
    setPerguntas(sorteadasNesteLancamento);
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
        .catch(() => undefined);
    }

    setPergunta('');
    void haptics.send();
    router.push(`/(main)/chat/${id}`);
  }

  return (
    <ScrollView
      contentContainerStyle={{
        flexGrow: 1,
        padding: spacing.xl,
        paddingTop: insets.top + spacing.lg,
        paddingBottom: insets.bottom + spacing.xl,
      }}
    >
      <View style={{ alignItems: 'center', gap: spacing.md }}>
        <Image
          source={require('../../assets/images/logo-glow.png')}
          style={{ width: 64, height: 64 }}
          accessibilityLabel="USPapo"
        />
        <Text
          style={{
            color: colors.foreground,
            fontSize: typography['2xl'].fontSize,
            fontWeight: '800',
            textAlign: 'center',
          }}
        >
          Pergunte qualquer coisa sobre a USP
        </Text>
      </View>

      {/* Glass composer: multiline input + circular brand send. */}
      <View
        style={[
          glass.brand,
          glass.shadow,
          {
            borderRadius: radius.xl,
            marginTop: spacing['2xl'],
            padding: spacing.md,
          },
        ]}
      >
        <TextInput
          value={pergunta}
          onChangeText={setPergunta}
          placeholder="Pergunte sobre a USP…"
          placeholderTextColor={colors.faintForeground}
          multiline
          numberOfLines={3}
          textAlignVertical="top"
          style={{
            color: colors.foreground,
            fontSize: typography.base.fontSize,
            flex: 1,
            maxHeight: 120,
            paddingVertical: spacing.sm,
          }}
        />
        <Pressable
          onPress={() => iniciarConversa(pergunta)}
          disabled={!pergunta.trim()}
          style={({ pressed }) => [
            {
              alignItems: 'center',
              backgroundColor: colors.brand,
              borderRadius: radius.full,
              height: 44,
              justifyContent: 'center',
              width: 44,
              alignSelf: 'flex-end',
              marginTop: spacing.sm,
              opacity: !pergunta.trim() ? 0.4 : pressed ? 0.85 : 1,
            },
          ]}
          accessibilityLabel="Enviar pergunta"
        >
          <Text
            style={{
              color: colors.brandForeground,
              fontSize: typography.lg.fontSize,
              fontWeight: '700',
            }}
          >
            ➤
          </Text>
        </Pressable>
      </View>

      {/* FAQ pills: 3 of 6, shuffled once per launch. */}
      <View style={{ marginTop: spacing['2xl'] }}>
        <Text
          style={{
            color: colors.mutedForeground,
            fontSize: typography.sm.fontSize,
            fontWeight: '600',
            marginBottom: spacing.sm,
          }}
        >
          Você também pode perguntar
        </Text>
        <View style={{ gap: spacing.sm }}>
          {perguntas.map((p) => (
            <Pressable
              key={p.trecho}
              onPress={() => iniciarConversa(p.prompt)}
              style={({ pressed }) => [
                glass.surface,
                glass.hairline,
                {
                  borderRadius: radius.full,
                  opacity: pressed ? 0.8 : 1,
                  paddingVertical: spacing.md,
                  paddingHorizontal: spacing.lg,
                },
              ]}
            >
              <Text
                style={{
                  color: colors.foreground,
                  fontSize: typography.sm.fontSize,
                }}
              >
                {p.trecho}
              </Text>
            </Pressable>
          ))}
        </View>
      </View>

      {/* "Continuar de onde parou" — placeholder section (P9 fills it with
          the last conversations from the local cache). */}
      <View style={{ marginTop: spacing['3xl'] }}>
        <Text
          style={{
            color: colors.mutedForeground,
            fontSize: typography.sm.fontSize,
            fontWeight: '600',
            marginBottom: spacing.sm,
          }}
        >
          Continuar de onde parou
        </Text>
        <View
          style={[
            glass.surface,
            glass.hairline,
            {
              borderRadius: radius.lg,
              gap: spacing.sm,
              padding: spacing.lg,
            },
          ]}
        >
          <View
            style={{
              backgroundColor: colors.line,
              borderRadius: radius.md,
              height: 40,
              opacity: 0.12,
            }}
          />
          <View
            style={{
              backgroundColor: colors.line,
              borderRadius: radius.md,
              height: 40,
              opacity: 0.08,
            }}
          />
          <Text
            style={{
              color: colors.faintForeground,
              fontSize: typography.xs.fontSize,
            }}
          >
            Suas últimas conversas aparecem aqui (P9).
          </Text>
        </View>
      </View>
    </ScrollView>
  );
}
