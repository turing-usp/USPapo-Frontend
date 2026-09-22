/** Home: brand, composer, 3 shuffled frequent questions and "Continuar de onde parou". */
import { useRouter } from 'expo-router';
import React, { useEffect, useState } from 'react';
import { ScrollView, View, useWindowDimensions } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { ALTURA_CHROME } from '../../components/Chrome';
import Composer from '../../components/Composer';
import Glass from '../../components/Glass';
import { Icone, LogoTuring, LogoUSPapo } from '../../components/icons';
import { Coluna, Texto } from '../../components/ui';
import { sessaoAtual } from '../../lib/auth';
import { historicoEmCache } from '../../lib/cache';
import { guardarPendente, novoId } from '../../lib/chat';
import { lerHistorico, rotuloDa, type Conversa } from '../../lib/conversations';
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

export default function Inicio() {
  const { colors, fonts, radius, spacing } = useTheme();
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const { width } = useWindowDimensions();
  const teclado = useAlturaDoTeclado();
  const largo = width >= 768;
  const [pergunta, setPergunta] = useState('');
  const [perguntas] = useState(sortear);
  const [recentes, setRecentes] = useState<Conversa[]>([]);

  useEffect(() => {
    let ativo = true;
    void (async () => {
      const { userId } = await sessaoAtual();
      if (!userId) return;
      const lista = await lerHistorico(userId, 3).catch(() => historicoEmCache(userId));
      if (ativo) setRecentes(lista.slice(0, 3));
    })();
    return () => {
      ativo = false;
    };
  }, []);

  function iniciar(texto: string) {
    const limpo = texto.trim();
    if (!limpo) return;
    const id = novoId();
    guardarPendente(id, limpo);
    setPergunta('');
    router.push(`/chat/${id}`);
  }

  return (
    <ScrollView keyboardShouldPersistTaps="handled"
      contentContainerStyle={{ flexGrow: 1, paddingTop: insets.top + ALTURA_CHROME, paddingBottom: insets.bottom + spacing.lg + teclado }}>
      <View style={{ flex: 1, justifyContent: 'center', paddingVertical: spacing['3xl'], gap: spacing['2xl'] }}>
        <Coluna style={{ alignItems: 'center', gap: spacing.md }}>
          <View style={{ alignItems: 'center', flexDirection: largo ? 'row' : 'column', gap: spacing.sm }}>
            <LogoUSPapo size={40} />
            <Texto cor={colors.brand} style={{ fontFamily: fonts.display, fontSize: largo ? 48 : 36, lineHeight: largo ? 56 : 44 }}>USPapo</Texto>
          </View>
          <Texto centro style={{ fontFamily: fonts.display, fontSize: largo ? 20 : 16 }}>
            Seu <Texto cor={colors.brand} style={{ fontFamily: fonts.display, fontSize: largo ? 20 : 16 }}>assistente inteligente</Texto> para navegar pela USP
          </Texto>
        </Coluna>

        <Coluna chat>
          <Composer value={pergunta} onChange={setPergunta} onSubmit={iniciar} />
        </Coluna>

        <Coluna style={{ alignItems: 'center', gap: spacing.lg }}>
          <Texto style={{ fontFamily: fonts.display }}>Perguntas Frequentes</Texto>
          <View style={{ flexDirection: largo ? 'row' : 'column', gap: largo ? spacing['2xl'] : spacing.lg, width: '100%', justifyContent: 'center' }}>
            {perguntas.map(([trecho, prompt]) => (
              <Glass key={trecho} radius={radius.full} onPress={() => iniciar(prompt)} accessibilityLabel={trecho}
                style={{ alignItems: 'center', justifyContent: 'center', minHeight: 56, paddingHorizontal: spacing.lg, alignSelf: 'center',
                  width: largo ? undefined : '100%', maxWidth: 288, flex: largo ? 1 : undefined }}>
                <Texto centro>{trecho}</Texto>
              </Glass>
            ))}
          </View>
        </Coluna>

        {recentes.length ? (
          <Coluna chat style={{ gap: spacing.sm }}>
            <Texto v="secao">Continuar de onde parou</Texto>
            {recentes.map((c) => (
              <Glass key={c.id} radius={radius.lg} onPress={() => router.push(`/chat/${c.id}`)} accessibilityLabel={rotuloDa(c)}
                style={{ flexDirection: 'row', alignItems: 'center', gap: spacing.sm, paddingVertical: spacing.md, paddingHorizontal: spacing.lg }}>
                <Texto numberOfLines={1} style={{ flex: 1 }}>{rotuloDa(c)}</Texto>
                <Icone nome="seta" cor={colors.mutedForeground} tamanho={16} />
              </Glass>
            ))}
          </Coluna>
        ) : null}
      </View>

      <Coluna style={{ alignItems: 'center', flexDirection: 'row', justifyContent: 'center', gap: spacing.sm, paddingVertical: spacing.lg }}>
        <Texto cor={colors.brand} style={{ fontFamily: fonts.display }}>Desenvolvido por</Texto>
        <LogoTuring size={28} />
        <Texto cor={colors.brand} style={{ fontFamily: fonts.accent }}>turing.usp</Texto>
      </Coluna>
    </ScrollView>
  );
}
