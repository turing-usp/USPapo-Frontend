/** Settings: theme, haptics, memory, the offline cache and about. */
import Constants from 'expo-constants';
import * as Updates from 'expo-updates';
import React, { useEffect, useState } from 'react';
import { Linking, Platform, Pressable, ScrollView, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { ALTURA_CHROME } from '../../components/Chrome';
import { Icone } from '../../components/icons';
import { Botao, Cartao, Interruptor, Texto } from '../../components/ui';
import { sessaoAtual } from '../../lib/auth';
import { limparCache, tamanhoDoCache } from '../../lib/cache';
import { carregarHaptics, definirHaptics, haptics } from '../../lib/device';
import {
  apagarMemoria, definirMemoriaAtiva, itensDaMemoria, lerMemoria, removerFato, type ItemMemoria, type Memoria,
} from '../../lib/memoria';
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
  const { colors, layout, spacing } = useTheme();
  const insets = useSafeAreaInsets();
  const [tema, setTema] = useState<ThemePreference>('system');
  const [vibracao, setVibracao] = useState(true);
  const [cache, setCache] = useState<number | null>(null);
  const [limpando, setLimpando] = useState(false);
  const [uid, setUid] = useState('');
  const [memoria, setMemoria] = useState<Memoria | null>(null); // null: no session or table not migrated (card hidden)
  const [ocupada, setOcupada] = useState<'' | 'alternar' | 'fato' | 'tudo'>('');

  useEffect(() => {
    void readScheme().then(setTema);
    void carregarHaptics().then(setVibracao);
    void tamanhoDoCache().then(setCache);
    void sessaoAtual().then(async ({ userId }) => {
      setUid(userId);
      if (userId) setMemoria(await lerMemoria(userId));
    });
  }, []);

  async function limpar() {
    setLimpando(true);
    await limparCache();
    setCache(await tamanhoDoCache());
    setLimpando(false);
    void haptics.selection();
  }

  async function alternarMemoria() {
    if (!memoria || ocupada) return;
    const ativa = !memoria.ativa;
    setMemoria({ ...memoria, ativa });
    setOcupada('alternar');
    void haptics.selection();
    const ok = await definirMemoriaAtiva(uid, ativa);
    setOcupada('');
    if (!ok) {
      setMemoria((m) => m && { ...m, ativa: !ativa });
      void haptics.error();
    }
  }

  /** One fact, or everything when no item is given. */
  async function esquecer(item?: ItemMemoria) {
    if (!memoria || ocupada) return;
    setOcupada(item ? 'fato' : 'tudo');
    const fatos = item ? await removerFato(uid, memoria.fatos, item) : (await apagarMemoria(uid)) ? {} : null;
    setOcupada('');
    if (fatos) setMemoria((m) => m && { ...m, fatos });
    void (fatos ? haptics.selection() : haptics.error());
  }

  const itens = memoria ? itensDaMemoria(memoria.fatos) : [];
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
          <Interruptor ligado={vibracao} rotulo="Resposta tátil ao tocar, enviar e receber"
            onPress={() => { const v = !vibracao; setVibracao(v); void definirHaptics(v).then(() => v && haptics.selection()); }} />
        </Cartao>
      ) : null}

      {memoria ? (
        <Cartao titulo="Memória">
          <Interruptor ligado={memoria.ativa} rotulo="Lembrar informações entre conversas" onPress={() => void alternarMemoria()} />
          <Texto v="legenda">
            O USPapo guarda só o essencial que você contar (curso, unidade, ano de ingresso…) para personalizar as respostas em novas
            conversas. Desligada, ele não lê nem salva nada.
          </Texto>
          {itens.length ? itens.map((item, i) => (
            <View key={`${item.chave}:${item.indice ?? ''}`} style={{ flexDirection: 'row', alignItems: 'center', gap: spacing.md }}>
              <View style={{ flex: 1 }}>
                {itens[i - 1]?.chave !== item.chave ? <Texto v="suave">{item.rotulo}</Texto> : null}
                <Texto>{item.valor}</Texto>
              </View>
              <Pressable accessibilityRole="button" accessibilityLabel={`Esquecer: ${item.valor}`} hitSlop={8} disabled={!!ocupada}
                onPress={() => void esquecer(item)} style={({ pressed }) => ({ opacity: pressed || ocupada ? 0.5 : 1 })}>
                <Icone nome="fechar" cor={colors.mutedForeground} tamanho={16} />
              </Pressable>
            </View>
          )) : <Texto v="suave">Nada guardado ainda.</Texto>}
          <Botao v="secundario" icone="lixo" rotulo="Apagar memória" carregando={ocupada === 'tudo'} desabilitado={!itens.length || !!ocupada}
            onPress={() => void esquecer()} />
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
