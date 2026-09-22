/** Settings: theme, haptics, the offline cache and about. */
import Constants from 'expo-constants';
import * as Updates from 'expo-updates';
import React, { useEffect, useState } from 'react';
import { Linking, Platform, Pressable, ScrollView, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { ALTURA_CHROME } from '../../components/Chrome';
import { Botao, Cartao, Texto } from '../../components/ui';
import { limparCache, tamanhoDoCache } from '../../lib/cache';
import { carregarHaptics, definirHaptics, haptics } from '../../lib/device';
import { readScheme, setScheme, useTheme, type ThemePreference } from '../../theme';

const TEMAS: [ThemePreference, string][] = [['system', 'Sistema'], ['light', 'Claro'], ['dark', 'Escuro']];
const SITE = 'https://uspapo.turingusp.com';

function formatarBytes(n: number): string {
  if (n < 1024) return `${n} B`;
  return n < 1024 * 1024 ? `${(n / 1024).toFixed(1)} KB` : `${(n / 1024 / 1024).toFixed(1)} MB`;
}

function Linha({ rotulo, valor }: { rotulo: string; valor: string }) {
  return (
    <View style={{ flexDirection: 'row', justifyContent: 'space-between', gap: 12 }}>
      <Texto>{rotulo}</Texto>
      <Texto v="suave">{valor}</Texto>
    </View>
  );
}

export default function Ajustes() {
  const { colors, layout, radius, spacing } = useTheme();
  const insets = useSafeAreaInsets();
  const [tema, setTema] = useState<ThemePreference>('system');
  const [vibracao, setVibracao] = useState(true);
  const [cache, setCache] = useState<number | null>(null);
  const [limpando, setLimpando] = useState(false);

  useEffect(() => {
    void readScheme().then(setTema);
    void carregarHaptics().then(setVibracao);
    void tamanhoDoCache().then(setCache);
  }, []);

  async function limpar() {
    setLimpando(true);
    await limparCache();
    setCache(await tamanhoDoCache());
    setLimpando(false);
    void haptics.selection();
  }

  const versao = `${Constants.expoConfig?.version ?? '—'}${Updates.updateId ? ` · atualização ${Updates.updateId.slice(0, 8)}` : ''}`;

  return (
    <ScrollView contentContainerStyle={{ alignSelf: 'center', width: '100%', maxWidth: layout.containerMaxWidth, gap: spacing.lg,
      paddingHorizontal: spacing.lg, paddingTop: insets.top + ALTURA_CHROME + spacing.md, paddingBottom: insets.bottom + spacing.xl }}>
      <Texto v="titulo">Ajustes</Texto>

      <Cartao titulo="Tema">
        <View style={{ flexDirection: 'row', gap: spacing.xs }} accessibilityRole="radiogroup">
          {TEMAS.map(([valor, rotulo]) => (
            <Botao key={valor} compacto rotulo={rotulo} v={tema === valor ? 'primario' : 'secundario'} style={{ flex: 1 }}
              onPress={() => { setTema(valor); void setScheme(valor); void haptics.selection(); }} />
          ))}
        </View>
      </Cartao>

      {Platform.OS !== 'web' ? (
        <Cartao titulo="Vibração">
          <Pressable accessibilityRole="switch" accessibilityState={{ checked: vibracao }} style={{ flexDirection: 'row', alignItems: 'center', gap: spacing.md }}
            onPress={() => { const v = !vibracao; setVibracao(v); void definirHaptics(v).then(() => v && haptics.selection()); }}>
            <View style={{ width: 48, height: 28, padding: 3, borderRadius: radius.full, justifyContent: 'center',
              alignItems: vibracao ? 'flex-end' : 'flex-start', backgroundColor: vibracao ? colors.brand : colors.line + '33' }}>
              <View style={{ width: 22, height: 22, borderRadius: radius.full, backgroundColor: colors.brandForeground }} />
            </View>
            <Texto style={{ flex: 1 }}>Resposta tátil ao tocar, enviar e receber</Texto>
          </Pressable>
        </Cartao>
      ) : null}

      <Cartao titulo="Dados e armazenamento">
        <Linha rotulo="Conversas salvas no aparelho" valor={cache === null ? '…' : formatarBytes(cache)} />
        <Texto v="legenda">Uma cópia das suas últimas conversas fica neste aparelho para você consultá-las sem internet.</Texto>
        <Botao v="secundario" icone="lixo" rotulo="Limpar cache" carregando={limpando} desabilitado={!cache} onPress={() => void limpar()} />
      </Cartao>

      <Cartao titulo="Sobre">
        <Linha rotulo="Versão" valor={versao} />
        <Texto v="suave">Desenvolvido pelo Turing USP</Texto>
        <Texto v="link" accessibilityRole="link" onPress={() => void Linking.openURL(SITE)}>uspapo.turingusp.com</Texto>
      </Cartao>
    </ScrollView>
  );
}
