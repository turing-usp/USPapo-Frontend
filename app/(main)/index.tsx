/**
 * Home (novo chat): brand, composer, 3 shuffled frequent questions and the Turing signature, all on
 * one screen without scrolling; short screens get a tighter layout. The keyboard changes nothing on
 * it: it only adds its own height below, so whatever it covers can be scrolled to.
 */
import { useRouter } from 'expo-router';
import React, { useState } from 'react';
import { ScrollView, View, useWindowDimensions } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { ALTURA_CHROME } from '../../components/Chrome';
import Composer from '../../components/Composer';
import Glass from '../../components/Glass';
import { Assinatura, Coluna, Marca, Texto } from '../../components/ui';
import { guardarPendente, novoId } from '../../lib/chat';
import { useAlturaDoTeclado } from '../../lib/device';
import { useTheme } from '../../theme';

const PERGUNTAS: [string, string][] = [
  ['Cardápio de hoje?', 'Qual é o cardápio de hoje nos bandejões do Butantã, no almoço e no jantar?'],
  ['Tem choque de horário?', 'Quais são as turmas de MAC0110 e MAT2454 neste semestre, e existe choque de horário entre elas?'],
  ['O que se estuda em Engenharia de Computação?', 'Quais são as disciplinas obrigatórias do primeiro semestre de Engenharia de Computação na Poli?'],
  ['Como funciona uma disciplina?', 'Qual é a ementa de MAC2166, quantos créditos ela vale e quais são os requisitos para cursá-la?'],
  ['O que é o Jupiterweb?', 'O que é o JupiterWeb e para que um aluno da USP usa esse sistema?'],
  ['Quanto dura o curso de Direito?', 'Quantos semestres dura o curso de Direito na USP e quais disciplinas se cursa em cada um?'],
];

function sortear(): [string, string][] {
  const copia = [...PERGUNTAS];
  for (let i = copia.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [copia[i], copia[j]] = [copia[j], copia[i]];
  }
  return copia.slice(0, 3);
}

/** Below this height (between the chrome and the bottom edge) the home tightens to fit. */
const ALTURA_CONFORTAVEL = 640;

export default function Inicio() {
  const { colors, radius, spacing, typography } = useTheme();
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const { width, height } = useWindowDimensions();
  const teclado = useAlturaDoTeclado();
  const largo = width >= 768;
  const compacto = height - insets.top - ALTURA_CHROME - insets.bottom < ALTURA_CONFORTAVEL;
  // The visible height, which the keyboard does not change (it is drawn over the window).
  const [visivel, setVisivel] = useState(height);
  const [pergunta, setPergunta] = useState('');
  const [perguntas] = useState(sortear);

  function iniciar(texto: string) {
    const limpo = texto.trim();
    if (!limpo) return;
    const id = novoId();
    guardarPendente(id, limpo);
    setPergunta('');
    router.push(`/chat/${id}`);
  }

  const lema = largo ? typography.xl : typography.base;
  return (
    // The page is exactly the visible height (it scrolls only with the keyboard up, or in a window
    // smaller than any phone), so opening the keyboard moves nothing.
    <ScrollView keyboardShouldPersistTaps="handled" onLayout={(e) => setVisivel(e.nativeEvent.layout.height)}
      contentContainerStyle={{ paddingBottom: teclado }}>
      <View style={{ minHeight: visivel, paddingTop: insets.top + ALTURA_CHROME, paddingBottom: insets.bottom }}>
        <View style={{ flex: 1, justifyContent: 'center', paddingVertical: spacing.lg, gap: compacto ? spacing.xl : spacing['3xl'] }}>
          <Coluna style={{ alignItems: 'center', gap: compacto ? spacing.sm : spacing.md }}>
            <Marca logo={largo ? 48 : compacto ? 32 : 40} fonte={largo ? 48 : compacto ? 30 : 36} coluna={!largo} />
            <Texto centro v="suave" style={lema}>
              Seu <Texto cor={colors.accent} style={lema}>assistente inteligente</Texto> para navegar pela USP
            </Texto>
          </Coluna>

          <Coluna chat>
            <Composer value={pergunta} onChange={setPergunta} onSubmit={iniciar} />
          </Coluna>

          <Coluna style={{ alignItems: 'center', gap: compacto ? spacing.sm : spacing.md }}>
            <Texto v="secao">Perguntas frequentes</Texto>
            <View style={{ flexDirection: largo ? 'row' : 'column', gap: largo ? spacing.lg : compacto ? spacing.sm : spacing.md,
              width: '100%', justifyContent: 'center' }}>
              {perguntas.map(([trecho, prompt]) => (
                <Glass key={trecho} radius={radius.full} onPress={() => iniciar(prompt)} accessibilityLabel={trecho}
                  style={{ alignItems: 'center', justifyContent: 'center', minHeight: compacto ? 44 : 52, paddingHorizontal: spacing.lg,
                    alignSelf: 'center', width: largo ? undefined : '100%', maxWidth: 288, flex: largo ? 1 : undefined }}>
                  <Texto centro numberOfLines={2}>{trecho}</Texto>
                </Glass>
              ))}
            </View>
          </Coluna>
        </View>

        <View style={{ paddingTop: spacing.sm, paddingBottom: compacto ? spacing.md : spacing.xl }}><Assinatura /></View>
      </View>
    </ScrollView>
  );
}
