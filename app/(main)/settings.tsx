/** Configurações: the account (password), theme, haptics, notifications, memory, the offline cache and about. */
import Constants from 'expo-constants';
import * as Updates from 'expo-updates';
import React, { useEffect, useState } from 'react';
import { Linking, Platform, ScrollView, View, useWindowDimensions } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { ALTURA_CHROME } from '../../components/Chrome';
import { OlhoDaSenha, RegrasDeSenha } from '../../components/auth';
import { Icone } from '../../components/icons';
import { Assinatura, Botao, BotaoDeIcone, Campo, Cartao, Erro, Interruptor, Texto } from '../../components/ui';
import { contaDeLogin, senhaValida, sessaoAtual, trocarSenha, type ContaDeLogin } from '../../lib/auth';
import { limparCache, tamanhoDoCache } from '../../lib/cache';
import { carregarHaptics, definirHaptics, haptics } from '../../lib/device';
import {
  apagarMemoria, definirMemoriaAtiva, itensDaMemoria, lerMemoria, removerFato, type ItemMemoria, type Memoria,
} from '../../lib/memoria';
import { DESCRICAO, NOTIFICACOES_DISPONIVEIS, definirNotificacoes, notificacoesAtivas } from '../../lib/notificacoes';
import { readScheme, setScheme, useTheme, type ThemePreference } from '../../theme';

const TEMAS: [ThemePreference, string][] = [['system', 'Sistema'], ['light', 'Claro'], ['dark', 'Escuro'], ['oled', 'Escuro OLED']];
const SITE = 'https://uspapo.turingusp.com';

function formatarBytes(n: number): string {
  if (n < 1024) return `${n} B`;
  return n < 1024 * 1024 ? `${(n / 1024).toFixed(1)} KB` : `${(n / 1024 / 1024).toFixed(1)} MB`;
}

/** A label and a technical value (a size, a version), the value in the detail face. */
function Linha({ rotulo, valor }: { rotulo: string; valor: string }) {
  return (
    <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', gap: 12 }}>
      <Texto>{rotulo}</Texto>
      <Texto v="detalhe" style={{ flexShrink: 1, textAlign: 'right' }}>{valor}</Texto>
    </View>
  );
}

/**
 * E-mail and password. An account with a password changes it (the current one is asked first); an
 * account that only signs in with Google can create one, to sign in with e-mail too.
 */
function CartaoDaConta() {
  const { colors, spacing } = useTheme();
  const [conta, setConta] = useState<ContaDeLogin | null>(null);
  const [aberto, setAberto] = useState(false);
  const [atual, setAtual] = useState('');
  const [nova, setNova] = useState('');
  const [confirma, setConfirma] = useState('');
  const [ver, setVer] = useState(false);
  const [salvando, setSalvando] = useState(false);
  const [erro, setErro] = useState<string | null>(null);
  const [feito, setFeito] = useState(false);

  useEffect(() => {
    void contaDeLogin().then(setConta);
  }, []);
  if (!conta) return null;

  function fechar() {
    setAberto(false);
    setAtual('');
    setNova('');
    setConfirma('');
    setErro(null);
  }

  async function salvar() {
    if (!conta) return;
    if (conta.temSenha && !atual) return setErro('Informe a senha atual.');
    if (!senhaValida(nova)) return setErro('A nova senha não atende aos requisitos.');
    if (nova !== confirma) return setErro('As senhas não coincidem.');
    setSalvando(true);
    setErro(null);
    const falha = await trocarSenha(conta.email, conta.temSenha ? atual : null, nova);
    setSalvando(false);
    if (falha) {
      setErro(falha);
      void haptics.error();
      return;
    }
    void haptics.finished();
    fechar();
    setFeito(true);
    setConta({ ...conta, temSenha: true });
  }

  const olho = <OlhoDaSenha visivel={ver} alternar={() => setVer((v) => !v)} />;
  return (
    <Cartao titulo="Conta">
      <Linha rotulo="E-mail" valor={conta.email} />
      {conta.google && !conta.temSenha && !feito ? (
        <Texto v="legenda">Você entra com o Google. Criando uma senha, também pode entrar com e-mail e senha.</Texto>
      ) : null}
      {aberto ? (
        <View style={{ gap: spacing.sm }}>
          {conta.temSenha ? (
            <Campo icone="cadeado" value={atual} onChangeText={setAtual} placeholder="Senha atual" secureTextEntry={!ver}
              autoComplete="current-password" textContentType="password" final={olho} />
          ) : null}
          <Campo icone="cadeado" value={nova} onChangeText={setNova} placeholder="Nova senha" secureTextEntry={!ver}
            autoComplete="new-password" textContentType="newPassword" final={conta.temSenha ? undefined : olho} />
          <RegrasDeSenha senha={nova} />
          <Campo icone="cadeado" value={confirma} onChangeText={setConfirma} placeholder="Confirme a nova senha" secureTextEntry={!ver}
            autoComplete="new-password" textContentType="newPassword" onSubmitEditing={() => void salvar()} />
          {erro ? <Erro>{erro}</Erro> : null}
          <View style={{ flexDirection: 'row', gap: spacing.sm }}>
            <Botao v="secundario" rotulo="Cancelar" desabilitado={salvando} onPress={fechar} style={{ flex: 1 }} />
            <Botao rotulo="Salvar" carregando={salvando} onPress={() => void salvar()} style={{ flex: 1 }} />
          </View>
        </View>
      ) : (
        <>
          {feito ? (
            <View style={{ flexDirection: 'row', alignItems: 'center', gap: spacing.sm }} accessibilityLiveRegion="polite">
              <Icone nome="check" cor={colors.accent} tamanho={16} traco={2.2} />
              <Texto v="suave" cor={colors.foreground}>Senha salva.</Texto>
            </View>
          ) : null}
          <Botao v="secundario" icone="cadeado" rotulo={conta.temSenha ? 'Alterar senha' : 'Criar senha'}
            onPress={() => { setFeito(false); setAberto(true); }} />
        </>
      )}
    </Cartao>
  );
}

export default function Configuracoes() {
  const { layout, spacing } = useTheme();
  const insets = useSafeAreaInsets();
  const { width } = useWindowDimensions();
  const [tema, setTema] = useState<ThemePreference>('system');
  const [vibracao, setVibracao] = useState(true);
  const [avisos, setAvisos] = useState(false);
  const [cache, setCache] = useState<number | null>(null);
  const [limpando, setLimpando] = useState(false);
  const [uid, setUid] = useState('');
  const [memoria, setMemoria] = useState<Memoria | null>(null); // null: no session or table not migrated (card hidden)
  const [ocupada, setOcupada] = useState<'' | 'alternar' | 'fato' | 'tudo'>('');

  useEffect(() => {
    void readScheme().then(setTema);
    void carregarHaptics().then(setVibracao);
    void notificacoesAtivas().then(setAvisos);
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
      <Texto v="titulo">Configurações</Texto>

      <CartaoDaConta />

      <Cartao titulo="Tema">
        {/* Two by two on phones, one row when it fits. */}
        <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: spacing.xs }} accessibilityRole="radiogroup">
          {TEMAS.map(([valor, rotulo]) => (
            <Botao key={valor} compacto rotulo={rotulo} v={tema === valor ? 'primario' : 'secundario'}
              style={{ flexGrow: 1, flexBasis: width >= 640 ? 0 : '45%' }}
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

      {NOTIFICACOES_DISPONIVEIS ? (
        <Cartao titulo="Notificações">
          <Interruptor ligado={avisos} rotulo="Avisar quando uma resposta ficar pronta"
            onPress={() => { const v = !avisos; setAvisos(v); void definirNotificacoes(v).then(setAvisos); void haptics.selection(); }} />
          <Texto v="legenda">{DESCRICAO}</Texto>
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
              <BotaoDeIcone icone="fechar" rotulo={`Esquecer: ${item.valor}`} onPress={() => void esquecer(item)} desabilitado={!!ocupada}
                tamanho={16} lado={28} rente />
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
        <Texto v="link" accessibilityRole="link" onPress={() => void Linking.openURL(SITE)}>uspapo.turingusp.com</Texto>
        <Assinatura inicio />
      </Cartao>
    </ScrollView>
  );
}
