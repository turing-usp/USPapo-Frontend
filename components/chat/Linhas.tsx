/** Chat lines: question bubble and answer (+ sources); progress, errors and notes are in Andamento. */
import React, { useEffect, useState, type ReactNode } from 'react';
import { Animated, Easing, Linking, Platform, View, useWindowDimensions } from 'react-native';

import { BotoesDaMensagem, Segurar } from './AcoesDaMensagem';
import Resposta from './Resposta';
import Glass from '../Glass';
import { Icone } from '../icons';
import { Texto } from '../ui';
import type { Linha } from '../../lib/chat';
import { useTheme } from '../../theme';

function useEntrada(animar = true): Animated.Value {
  const [entrada] = useState(() => new Animated.Value(animar ? 0 : 1));
  useEffect(() => {
    if (animar) Animated.timing(entrada, { toValue: 1, duration: 220, easing: Easing.out(Easing.cubic), useNativeDriver: true }).start();
  }, [animar, entrada]);
  return entrada;
}

function rotuloDaFonte(url: string): string {
  try {
    const { hostname, pathname } = new URL(url);
    return `${hostname.replace(/^www\./, '')}${pathname.replace(/\/+$/, '')}`;
  } catch {
    return url;
  }
}

function Fontes({ urls }: { urls: string[] }) {
  const { colors, radius, spacing } = useTheme();
  const seguras = urls.filter((u) => /^https?:\/\//i.test(u));
  if (!seguras.length) return null;
  return (
    <View style={{ gap: spacing.xs, marginTop: spacing.xs }}>
      <Texto v="secao">Fontes consultadas</Texto>
      <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 6 }}>
        {seguras.map((url) => (
          <Glass key={url} radius={radius.full} accessibilityLabel={url} onPress={() => void Linking.openURL(url).catch(() => undefined)}
            style={{ flexDirection: 'row', alignItems: 'center', gap: 6, maxWidth: '100%', paddingVertical: 5, paddingHorizontal: spacing.sm }}>
            <Icone nome="externo" cor={colors.accent} tamanho={13} traco={2} />
            <Texto v="detalhe" numberOfLines={1} style={{ flexShrink: 1 }}>{rotuloDaFonte(url)}</Texto>
          </Glass>
        ))}
      </View>
    </View>
  );
}

/** The question, with Copiar and Compartilhar under it (and on a long press). */
export function BolhaUsuario({ texto }: { texto: string }) {
  const { radius, spacing, typography } = useTheme();
  const { width } = useWindowDimensions();
  const entrada = useEntrada();
  return (
    <Animated.View style={{ alignSelf: 'flex-end', alignItems: 'flex-end', maxWidth: width >= 640 ? '75%' : '85%', opacity: entrada }}>
      <Segurar texto={texto}>
        <Glass radius={radius.xl} style={{ paddingHorizontal: spacing.xl, paddingVertical: spacing.md }}>
          {/* Selecting text would fight the long press on Android and iOS, whose menu copies it all. */}
          <Texto style={typography.lg} selectable={Platform.OS === 'web'}>{texto}</Texto>
        </Glass>
      </Segurar>
      <BotoesDaMensagem texto={texto} style={{ marginTop: spacing.xs }} />
    </Animated.View>
  );
}

/**
 * The answer. A live one (`revelar`) is written out from the cursor the thinking mark became, and
 * its sources and footer (`children`: Copiar, Compartilhar and the feedback) fade in once all of it
 * is on screen. Once complete, a long press opens Copiar and Compartilhar.
 */
export function BolhaAssistente({ linha, escrevendo, revelar = false, children }: {
  linha: Extract<Linha, { autor: 'assistant' }>; escrevendo: boolean; revelar?: boolean; children?: ReactNode;
}) {
  const [revelada, setRevelada] = useState(!revelar);
  return (
    <View style={{ alignSelf: 'stretch' }}>
      <Segurar texto={linha.completo ? linha.texto : null}>
        <Resposta texto={linha.texto} streaming={escrevendo} revelar={revelar} aoRevelar={() => setRevelada(true)} />
      </Segurar>
      {linha.completo && revelada ? <Rodape animar={revelar}><Fontes urls={linha.fontes} />{children}</Rodape> : null}
    </View>
  );
}

function Rodape({ animar, children }: { animar: boolean; children: ReactNode }) {
  const entrada = useEntrada(animar);
  const translateY = entrada.interpolate({ inputRange: [0, 1], outputRange: [4, 0] });
  return <Animated.View style={{ opacity: entrada, transform: [{ translateY }] }}>{children}</Animated.View>;
}
