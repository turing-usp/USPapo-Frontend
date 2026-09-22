/** Login: e-mail + password, and "Continuar com o Google". */
import { useRouter } from 'expo-router';
import React, { useEffect, useState } from 'react';
import { View } from 'react-native';

import { Divisor, OlhoDaSenha } from '../../components/auth';
import { GoogleG, TuringWordmark } from '../../components/icons';
import { Botao, Campo, ColunaCentral, Texto } from '../../components/ui';
import { entrarComGoogle, mapAuthError } from '../../lib/auth';
import { haptics } from '../../lib/device';
import { supabase } from '../../lib/supabase';

export default function Login() {
  const router = useRouter();
  const [email, setEmail] = useState('');
  const [senha, setSenha] = useState('');
  const [ver, setVer] = useState(false);
  const [carregando, setCarregando] = useState(false);
  const [erro, setErro] = useState<string | null>(null);

  // A session appearing here closes the (web) OAuth round trip.
  useEffect(() => {
    const { data } = supabase.auth.onAuthStateChange((evento, sessao) => {
      if (sessao && evento !== 'PASSWORD_RECOVERY') router.replace('/');
    });
    return () => data.subscription.unsubscribe();
  }, [router]);

  async function entrar() {
    if (!email.trim() || !senha) return setErro('Preencha o e-mail e a senha.');
    setCarregando(true);
    setErro(null);
    const { error } = await supabase.auth.signInWithPassword({ email: email.trim(), password: senha }).catch((e) => ({ error: e }));
    setCarregando(false);
    if (error) {
      setErro(mapAuthError(error));
      void haptics.error();
    }
  }

  async function google() {
    setCarregando(true);
    setErro(null);
    const r = await entrarComGoogle();
    setCarregando(false);
    if (!r.ok && !r.cancelado) {
      setErro(r.mensagem ?? 'Não foi possível entrar com o Google.');
      void haptics.error();
    }
  }

  return (
    <ColunaCentral>
      <View style={{ alignItems: 'center' }}><TuringWordmark size={144} /></View>
      <Texto v="titulo" centro>Entre com sua conta</Texto>
      <Campo icone="envelope" value={email} onChangeText={setEmail} placeholder="E-mail" autoCapitalize="none" autoCorrect={false}
        keyboardType="email-address" autoComplete="email" textContentType="emailAddress" />
      <Campo icone="cadeado" value={senha} onChangeText={setSenha} placeholder="Senha" secureTextEntry={!ver} autoComplete="current-password"
        textContentType="password" onSubmitEditing={() => void entrar()} final={<OlhoDaSenha visivel={ver} alternar={() => setVer((v) => !v)} />} />
      {erro ? <Texto v="erro" centro role="alert">{erro}</Texto> : null}
      <Botao rotulo="Entrar" carregando={carregando} onPress={() => void entrar()} />
      <Texto v="link" centro onPress={() => router.push('/reset')}>Esqueceu a senha?</Texto>
      <Divisor />
      <Botao v="secundario" rotulo="Continuar com o Google" icone={<GoogleG size={20} />} desabilitado={carregando} onPress={() => void google()} />
      <Texto v="suave" centro>
        Não tem uma conta? <Texto v="link" onPress={() => router.push('/register')}>Cadastre-se</Texto>
      </Texto>
    </ColunaCentral>
  );
}
