/**
 * Password reset: (1) e-mail -> recovery link back to /reset (web) or uspapofe://reset
 * (app); (2) the link opens a recovery session here and the new password is set.
 */
import * as Linking from 'expo-linking';
import { useLocalSearchParams, useRouter } from 'expo-router';
import React, { useEffect, useState } from 'react';
import { Platform } from 'react-native';

import { Botao, Campo, ColunaCentral, Texto } from '../../components/ui';
import { mapAuthError, senhaValida } from '../../lib/auth';
import { supabase } from '../../lib/supabase';
import { RegrasDeSenha } from '../../components/auth';

export default function Redefinir() {
  const router = useRouter();
  const { code } = useLocalSearchParams<{ code?: string }>();
  const [etapa, setEtapa] = useState<'email' | 'enviado' | 'nova'>('email');
  const [email, setEmail] = useState('');
  const [senha, setSenha] = useState('');
  const [confirma, setConfirma] = useState('');
  const [carregando, setCarregando] = useState(false);
  const [erro, setErro] = useState<string | null>(null);

  useEffect(() => {
    const { data } = supabase.auth.onAuthStateChange((evento) => evento === 'PASSWORD_RECOVERY' && setEtapa('nova'));
    // Native: the deep link carries the PKCE code (web exchanges it through detectSessionInUrl).
    if (code && Platform.OS !== 'web') {
      void supabase.auth.exchangeCodeForSession(String(code)).then(({ error }) =>
        error ? setErro('O link expirou ou já foi usado. Peça um novo.') : setEtapa('nova'));
    }
    return () => data.subscription.unsubscribe();
  }, [code]);

  async function enviarLink() {
    if (!email.trim()) return setErro('Informe seu e-mail.');
    setCarregando(true);
    setErro(null);
    const redirectTo = Platform.OS === 'web' ? `${globalThis.location?.origin ?? ''}/reset` : Linking.createURL('/reset');
    const { error } = await supabase.auth.resetPasswordForEmail(email.trim(), { redirectTo }).catch((e) => ({ error: e }));
    setCarregando(false);
    if (error) setErro(mapAuthError(error));
    else setEtapa('enviado');
  }

  async function salvar() {
    if (!senhaValida(senha)) return setErro('A senha não atende aos requisitos.');
    if (senha !== confirma) return setErro('As senhas não coincidem.');
    setCarregando(true);
    setErro(null);
    const { error } = await supabase.auth.updateUser({ password: senha }).catch((e) => ({ error: e }));
    setCarregando(false);
    if (error) setErro(mapAuthError(error));
    else router.replace('/');
  }

  return (
    <ColunaCentral>
      <Texto v="titulo" centro>{etapa === 'nova' ? 'Crie uma nova senha' : 'Recuperar senha'}</Texto>
      {etapa === 'email' ? (
        <>
          <Texto v="suave" centro>Informe seu e-mail e enviaremos um link para redefinir a senha.</Texto>
          <Campo icone="envelope" value={email} onChangeText={setEmail} placeholder="E-mail" autoCapitalize="none" autoCorrect={false}
            keyboardType="email-address" autoComplete="email" onSubmitEditing={() => void enviarLink()} />
          {erro ? <Texto v="erro" centro role="alert">{erro}</Texto> : null}
          <Botao rotulo="Enviar link" carregando={carregando} onPress={() => void enviarLink()} />
        </>
      ) : etapa === 'enviado' ? (
        <Texto v="suave" centro>
          Se houver uma conta com {email.trim()}, você vai receber um link em instantes. Abra-o neste aparelho para criar a nova senha.
        </Texto>
      ) : (
        <>
          <Campo icone="cadeado" value={senha} onChangeText={setSenha} placeholder="Nova senha" secureTextEntry autoComplete="new-password" />
          <RegrasDeSenha senha={senha} />
          <Campo icone="cadeado" value={confirma} onChangeText={setConfirma} placeholder="Confirme a nova senha" secureTextEntry
            autoComplete="new-password" onSubmitEditing={() => void salvar()} />
          {erro ? <Texto v="erro" centro role="alert">{erro}</Texto> : null}
          <Botao rotulo="Salvar nova senha" carregando={carregando} onPress={() => void salvar()} />
        </>
      )}
      <Texto v="link" centro onPress={() => router.replace('/login')}>Voltar para o login</Texto>
    </ColunaCentral>
  );
}
