/** Sign up: name, e-mail, password (live 5-rule checklist) and confirmation; then "confira seu e-mail". */
import { useRouter } from 'expo-router';
import React, { useState } from 'react';

import { OlhoDaSenha, RegrasDeSenha } from '../../components/auth';
import { Botao, Campo, ColunaCentral, Texto } from '../../components/ui';
import { mapAuthError, senhaValida, urlDeRetorno } from '../../lib/auth';
import { haptics } from '../../lib/device';
import { supabase } from '../../lib/supabase';

export default function Cadastro() {
  const router = useRouter();
  const [nome, setNome] = useState('');
  const [email, setEmail] = useState('');
  const [senha, setSenha] = useState('');
  const [confirma, setConfirma] = useState('');
  const [ver, setVer] = useState(false);
  const [carregando, setCarregando] = useState(false);
  const [erro, setErro] = useState<string | null>(null);
  const [enviado, setEnviado] = useState(false);

  async function cadastrar() {
    const falta = !nome.trim() ? 'Informe seu nome.' : !email.trim() ? 'Informe seu e-mail.'
      : !senhaValida(senha) ? 'A senha não atende aos requisitos.' : senha !== confirma ? 'As senhas não coincidem.' : null;
    if (falta) return setErro(falta);
    setCarregando(true);
    setErro(null);
    const { error } = await supabase.auth.signUp({
      email: email.trim(), password: senha,
      options: { data: { nome: nome.trim() }, emailRedirectTo: urlDeRetorno() },
    }).catch((e) => ({ error: e }));
    setCarregando(false);
    if (error) {
      setErro(mapAuthError(error));
      void haptics.error();
    } else setEnviado(true);
  }

  if (enviado) {
    return (
      <ColunaCentral>
        <Texto v="titulo" centro>Confira seu e-mail</Texto>
        <Texto v="suave" centro>Enviamos um link de confirmação para {email.trim()}. Depois de confirmar, é só entrar.</Texto>
        <Botao rotulo="Ir para o login" onPress={() => router.replace('/login')} />
      </ColunaCentral>
    );
  }

  return (
    <ColunaCentral>
      <Texto v="titulo" centro>Crie sua conta</Texto>
      <Campo icone="usuario" value={nome} onChangeText={setNome} placeholder="Nome" autoComplete="name" maxLength={80} />
      <Campo icone="envelope" value={email} onChangeText={setEmail} placeholder="E-mail" autoCapitalize="none" autoCorrect={false}
        keyboardType="email-address" autoComplete="email" />
      <Campo icone="cadeado" value={senha} onChangeText={setSenha} placeholder="Senha" secureTextEntry={!ver} autoComplete="new-password"
        final={<OlhoDaSenha visivel={ver} alternar={() => setVer((v) => !v)} />} />
      <RegrasDeSenha senha={senha} />
      <Campo icone="cadeado" value={confirma} onChangeText={setConfirma} placeholder="Confirme a senha" secureTextEntry={!ver}
        autoComplete="new-password" onSubmitEditing={() => void cadastrar()} />
      {erro ? <Texto v="erro" centro role="alert">{erro}</Texto> : null}
      <Botao rotulo="Cadastrar" carregando={carregando} onPress={() => void cadastrar()} />
      <Texto v="suave" centro>
        Já tem uma conta? <Texto v="link" onPress={() => router.replace('/login')}>Entrar</Texto>
      </Texto>
    </ColunaCentral>
  );
}
