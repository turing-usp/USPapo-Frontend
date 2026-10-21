/**
 * Password reset: (1) the e-mail, which gets a recovery link to the website (from the app too, see
 * lib/auth); (2) the link opens the site with its session (the session gate brings it here) and the
 * new password is set; (3) done: continue on the site, or open the app and sign in there.
 */
import * as Linking from 'expo-linking';
import { useRouter } from 'expo-router';
import React, { useState } from 'react';
import { Platform } from 'react-native';

import { Botao, Campo, ColunaCentral, Erro, Texto } from '../../components/ui';
import { encerrarRecuperacao, estadoDaRecuperacao, mapAuthError, pedirRedefinicao, senhaValida } from '../../lib/auth';
import { supabase } from '../../lib/supabase';
import { RegrasDeSenha } from '../../components/auth';

type Etapa = 'email' | 'enviado' | 'nova' | 'pronta';

/** A phone's browser: after the new password, the app may be the place to go back to. */
const NO_CELULAR = Platform.OS === 'web' && typeof navigator !== 'undefined' && /Android|iPhone|iPad/i.test(navigator.userAgent);

export default function Redefinir() {
  const router = useRouter();
  const [etapa, setEtapa] = useState<Etapa>(() => (estadoDaRecuperacao() === 'nova' ? 'nova' : 'email'));
  const [email, setEmail] = useState('');
  const [senha, setSenha] = useState('');
  const [confirma, setConfirma] = useState('');
  const [carregando, setCarregando] = useState(false);
  const [erro, setErro] = useState<string | null>(() =>
    estadoDaRecuperacao() === 'expirado' ? 'O link expirou ou já foi usado. Peça um novo abaixo.' : null);

  async function enviarLink() {
    if (!email.trim()) return setErro('Informe seu e-mail.');
    setCarregando(true);
    setErro(null);
    encerrarRecuperacao();
    const falha = await pedirRedefinicao(email.trim());
    setCarregando(false);
    if (falha) setErro(falha);
    else setEtapa('enviado');
  }

  async function salvar() {
    if (!senhaValida(senha)) return setErro('A senha não atende aos requisitos.');
    if (senha !== confirma) return setErro('As senhas não coincidem.');
    setCarregando(true);
    setErro(null);
    const { error } = await supabase.auth.updateUser({ password: senha }).catch((e) => ({ error: e }));
    setCarregando(false);
    if (error) return setErro(mapAuthError(error));
    encerrarRecuperacao();
    setEtapa('pronta');
  }

  const titulo = etapa === 'nova' ? 'Crie uma nova senha' : etapa === 'pronta' ? 'Senha alterada' : 'Recuperar senha';
  return (
    <ColunaCentral>
      <Texto v="titulo" centro>{titulo}</Texto>
      {etapa === 'email' ? (
        <>
          <Texto v="suave" centro>Informe seu e-mail e enviaremos um link para criar uma nova senha.</Texto>
          <Campo icone="envelope" value={email} onChangeText={setEmail} placeholder="E-mail" autoCapitalize="none" autoCorrect={false}
            keyboardType="email-address" autoComplete="email" onSubmitEditing={() => void enviarLink()} />
          {erro ? <Erro centro>{erro}</Erro> : null}
          <Botao rotulo="Enviar link" carregando={carregando} onPress={() => void enviarLink()} />
        </>
      ) : etapa === 'enviado' ? (
        <Texto v="suave" centro>
          {`Se houver uma conta com ${email.trim()}, você vai receber um link em instantes. Ele abre o site do USPapo, `
            + (Platform.OS === 'web' ? 'onde você cria a nova senha.' : 'onde você cria a nova senha; depois é só entrar aqui com ela.')}
        </Texto>
      ) : etapa === 'nova' ? (
        <>
          <Campo icone="cadeado" value={senha} onChangeText={setSenha} placeholder="Nova senha" secureTextEntry autoComplete="new-password" />
          <RegrasDeSenha senha={senha} />
          <Campo icone="cadeado" value={confirma} onChangeText={setConfirma} placeholder="Confirme a nova senha" secureTextEntry
            autoComplete="new-password" onSubmitEditing={() => void salvar()} />
          {erro ? <Erro centro>{erro}</Erro> : null}
          <Botao rotulo="Salvar nova senha" carregando={carregando} onPress={() => void salvar()} />
        </>
      ) : (
        <>
          <Texto v="suave" centro>
            {NO_CELULAR ? 'Pronto. No app do USPapo, entre com a nova senha; aqui no navegador você já está conectado.'
              : 'Pronto. Você já está conectado; no app, entre com a nova senha.'}
          </Texto>
          <Botao rotulo="Continuar" onPress={() => router.replace('/')} />
          {NO_CELULAR ? <Botao v="secundario" rotulo="Abrir o app" onPress={() => void Linking.openURL('uspapofe://login').catch(() => undefined)} /> : null}
        </>
      )}
      {etapa !== 'pronta' ? <Texto v="link" centro onPress={() => router.replace('/login')}>Voltar para o login</Texto> : null}
    </ColunaCentral>
  );
}
