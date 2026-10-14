/** Chat lines: question bubble and answer (+ sources); progress, errors and notes are in Andamento. */
import React, { useEffect, useState, type ReactNode } from 'react';
import { Animated, Easing, Linking, View, useWindowDimensions } from 'react-native';

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
      <Texto v="secao" style={{ fontSize: 11 }}>Fontes consultadas</Texto>
      <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 6 }}>
        {seguras.map((url) => (
          <Glass key={url} radius={radius.full} accessibilityLabel={url} onPress={() => void Linking.openURL(url).catch(() => undefined)}
            style={{ flexDirection: 'row', alignItems: 'center', gap: 6, maxWidth: '100%', paddingVertical: 5, paddingHorizontal: spacing.sm }}>
            <Icone nome="externo" cor={colors.brand} tamanho={13} traco={2} />
            <Texto v="legenda" numberOfLines={1} cor={colors.mutedForeground} style={{ flexShrink: 1 }}>{rotuloDaFonte(url)}</Texto>
          </Glass>
        ))}
      </View>
    </View>
  );
}

export function BolhaUsuario({ texto }: { texto: string }) {
  const { width } = useWindowDimensions();
  const entrada = useEntrada();
  return (
    <Animated.View style={{ alignSelf: 'flex-end', maxWidth: width >= 640 ? '75%' : '85%', opacity: entrada }}>
      <Glass radius={24} style={{ paddingHorizontal: 20, paddingVertical: 12 }}>
        <Texto style={{ fontSize: 18, lineHeight: 26 }} selectable>{texto}</Texto>
      </Glass>
    </Animated.View>
  );
}

/**
 * The answer. A live one (`revelar`) is written out from the cursor the thinking mark became, and
 * its sources and feedback fade in once all of it is on screen.
 */
export function BolhaAssistente({ linha, escrevendo, revelar = false, children }: {
  linha: Extract<Linha, { autor: 'assistant' }>; escrevendo: boolean; revelar?: boolean; children?: ReactNode;
}) {
  const [revelada, setRevelada] = useState(!revelar);
  return (
    <View style={{ alignSelf: 'stretch' }}>
      <Resposta texto={linha.texto} streaming={escrevendo} revelar={revelar} aoRevelar={() => setRevelada(true)} />
      {linha.completo && revelada ? <Rodape animar={revelar}><Fontes urls={linha.fontes} />{children}</Rodape> : null}
    </View>
  );
}

function Rodape({ animar, children }: { animar: boolean; children: ReactNode }) {
  const entrada = useEntrada(animar);
  const translateY = entrada.interpolate({ inputRange: [0, 1], outputRange: [4, 0] });
  return <Animated.View style={{ opacity: entrada, transform: [{ translateY }] }}>{children}</Animated.View>;
}
