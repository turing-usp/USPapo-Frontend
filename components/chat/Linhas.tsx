/** Chat lines: question bubble, answer (+ sources), tool/thinking status tags, error and note lines. */
import React, { useEffect, useState, type ReactNode } from 'react';
import { Animated, Easing, Linking, View, useWindowDimensions } from 'react-native';

import Resposta from './Resposta';
import Glass from '../Glass';
import { Icone } from '../icons';
import { Botao, Texto } from '../ui';
import { ferramenta } from '../../lib/api';
import type { Linha } from '../../lib/chat';
import { useTheme } from '../../theme';

function usePulso(ativo: boolean): Animated.Value {
  const [pulso] = useState(() => new Animated.Value(1));
  useEffect(() => {
    if (!ativo) return;
    const loop = Animated.loop(Animated.sequence([
      Animated.timing(pulso, { toValue: 0.3, duration: 600, easing: Easing.inOut(Easing.ease), useNativeDriver: true }),
      Animated.timing(pulso, { toValue: 1, duration: 600, easing: Easing.inOut(Easing.ease), useNativeDriver: true }),
    ]));
    loop.start();
    return () => {
      loop.stop();
      pulso.setValue(1);
    };
  }, [ativo, pulso]);
  return pulso;
}

function useEntrada(): Animated.Value {
  const [entrada] = useState(() => new Animated.Value(0));
  useEffect(() => {
    Animated.timing(entrada, { toValue: 1, duration: 220, easing: Easing.out(Easing.cubic), useNativeDriver: true }).start();
  }, [entrada]);
  return entrada;
}

/** One status tag shape for "Pensando…" and every tool: pulse while running, check when done. */
export function Etiqueta({ rotulo, descricao, pronta, testID }: { rotulo: string; descricao: string; pronta: boolean; testID?: string }) {
  const { colors, radius, spacing } = useTheme();
  const pulso = usePulso(!pronta);
  const entrada = useEntrada();
  return (
    <Animated.View style={{ alignSelf: 'flex-start', maxWidth: '92%', opacity: entrada }}>
      <Glass testID={testID} radius={radius.lg} style={{ flexDirection: 'row', gap: spacing.sm, paddingHorizontal: spacing.md, paddingVertical: 8 }}>
        {pronta ? <Icone nome="check" cor={colors.brand} tamanho={14} traco={2.4} />
          : <Animated.View style={{ width: 8, height: 8, marginTop: 4, borderRadius: 4, backgroundColor: colors.brand, opacity: pulso }} />}
        <View style={{ flexShrink: 1, gap: 1 }}>
          <Texto v="legenda" numberOfLines={1} cor={pronta ? colors.mutedForeground : colors.brand} style={{ fontFamily: 'Roboto-Bold' }}>{rotulo}</Texto>
          <Texto v="legenda" numberOfLines={2}>{descricao}</Texto>
        </View>
      </Glass>
    </Animated.View>
  );
}

export function Pensando() {
  return <Etiqueta testID="pensando" rotulo="Pensando…" descricao="O USPapo está preparando a resposta." pronta={false} />;
}

export function LinhaFerramenta({ linha }: { linha: Extract<Linha, { autor: 'ferramenta' }> }) {
  const { rotulo, descricao } = ferramenta(linha.nome);
  return (
    <Etiqueta testID="etiqueta-ferramenta" pronta={linha.pronta} descricao={descricao}
      rotulo={linha.pronta && linha.resultados > 0 ? `${rotulo} · ${linha.resultados}` : rotulo} />
  );
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

export function BolhaAssistente({ linha, children }: { linha: Extract<Linha, { autor: 'assistant' }>; children?: ReactNode }) {
  return (
    <View style={{ alignSelf: 'stretch' }}>
      <Resposta texto={linha.texto} streaming={!linha.completo} />
      {linha.completo ? <Fontes urls={linha.fontes} /> : null}
      {children}
    </View>
  );
}

export function LinhaErro({ linha, aoTentar }: { linha: Extract<Linha, { autor: 'erro' }>; aoTentar?: () => void }) {
  const { colors, radius, spacing } = useTheme();
  return (
    <Glass radius={radius.lg} borda={{ borderLeftColor: colors.danger, borderLeftWidth: 3 }}
      style={{ alignSelf: 'flex-start', maxWidth: '92%', padding: spacing.md, gap: spacing.sm }}>
      <Texto v="suave" cor={colors.foreground}>{linha.mensagem}</Texto>
      {aoTentar && linha.tipo !== 'sessao' ? <Botao compacto rotulo="Tentar de novo" onPress={aoTentar} style={{ alignSelf: 'flex-start' }} /> : null}
    </Glass>
  );
}

export function LinhaNota({ texto }: { texto: string }) {
  return <Texto v="legenda" style={{ fontStyle: 'italic' }}>{texto}</Texto>;
}
