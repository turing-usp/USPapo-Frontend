/**
 * Password reset — one screen, two steps:
 * (1) e-mail → resetPasswordForEmail → "enviamos um link" + "Já usei o link";
 * (2) nova senha + confirma → updateUser → success → '/'.
 *
 * The email link is the thing that opens a recovery session (web: the link
 * lands in the app URL and supabase-js picks it up; native: the link opens
 * the web app — P7 wires the handoff back into the app). Until then,
 * "Já usei o link" is the user's manual signal that the step is done.
 */
import { useRouter } from 'expo-router';
import React, { useState } from 'react';
import {
  ActivityIndicator,
  Pressable,
  Text,
  View,
} from 'react-native';

import CampoVidro from '../../components/CampoVidro';
import ColunaAuth from '../../components/ColunaAuth';
import { EnvelopeIcon, LockIcon } from '../../components/BrandMarks';
import { haptics } from '../../lib/haptics';
import { mapAuthError } from '../../lib/auth';
import { supabase } from '../../lib/supabase';
import { fonts, useTheme } from '../../theme';
import { todasAsRegrasPassam } from './regrasSenha';

type Etapa = 'email' | 'linkEnviado' | 'novaSenha';

export default function Reset() {
  const { colors, radius, spacing, typography } = useTheme();
  const router = useRouter();

  const [etapa, setEtapa] = useState<Etapa>('email');
  const [email, setEmail] = useState('');
  const [senha, setSenha] = useState('');
  const [confirma, setConfirma] = useState('');
  const [carregando, setCarregando] = useState(false);
  const [erro, setErro] = useState<string | null>(null);
  /** Which pill owns the brand focus ring. */
  const [foco, setFoco] = useState<string | null>(null);

  async function enviarLink() {
    if (carregando) return;
    if (!email.trim()) {
      setErro('Informe seu e-mail.');
      return;
    }
    setCarregando(true);
    setErro(null);
    try {
      const { error } = await supabase.auth.resetPasswordForEmail(email.trim());
      if (error) {
        setErro(mapAuthError(error));
        void haptics.error();
        return;
      }
      void haptics.send();
      setEtapa('linkEnviado');
    } catch (e) {
      setErro(mapAuthError(e));
      void haptics.error();
    } finally {
      setCarregando(false);
    }
  }

  async function definirNovaSenha() {
    if (carregando) return;
    if (senha !== confirma) {
      setErro('As senhas não coincidem.');
      return;
    }
    if (!todasAsRegrasPassam(senha)) {
      setErro('A senha não atende aos requisitos.');
      return;
    }
    setCarregando(true);
    setErro(null);
    try {
      const { error } = await supabase.auth.updateUser({ password: senha });
      if (error) {
        setErro(mapAuthError(error));
        void haptics.error();
        return;
      }
      void haptics.send();
      router.replace('/');
    } catch (e) {
      setErro(mapAuthError(e));
      void haptics.error();
    } finally {
      setCarregando(false);
    }
  }

  const botaoPrimario = (
    rotulo: string,
    onPress: () => void,
    carregandoAqui: boolean,
  ) => (
    <Pressable
      onPress={onPress}
      disabled={carregandoAqui}
      style={({ pressed }) => [
        {
          alignItems: 'center',
          backgroundColor: colors.brand,
          borderRadius: radius.full,
          justifyContent: 'center',
          minHeight: 52,
          marginTop: spacing.xl,
          opacity: carregandoAqui ? 0.7 : pressed ? 0.85 : 1,
        },
      ]}
    >
      {carregandoAqui ? (
        <ActivityIndicator color={colors.brandForeground} />
      ) : (
        <Text
          style={{
            color: colors.brandForeground,
            fontFamily: fonts.bodyBold,
            fontSize: typography.base.fontSize,
          }}
        >
          {rotulo}
        </Text>
      )}
    </Pressable>
  );

  return (
    <ColunaAuth>
        {etapa === 'email' ? (
          <>
            <Text
              style={{
                color: colors.foreground,
                fontFamily: fonts.displayBold,
                fontSize: typography.xl.fontSize,
              }}
            >
              Recuperar senha
            </Text>
            <Text
              style={{
                color: colors.mutedForeground,
                fontFamily: fonts.body,
                fontSize: typography.sm.fontSize,
                marginTop: spacing.xs,
              }}
            >
              Informe seu e-mail e enviamos um link para redefinir a senha.
            </Text>
            <View style={{ gap: spacing.sm, marginTop: spacing.xl }}>
              <CampoVidro
                focado={foco === 'email'}
                aoFocar={() => setFoco('email')}
                aoPerderFoco={() => setFoco(null)}
                icone={<EnvelopeIcon color={colors.mutedForeground} />}
                value={email}
                onChangeText={setEmail}
                placeholder="Email"
                autoCapitalize="none"
                autoCorrect={false}
                keyboardType="email-address"
              />
              {erro ? (
                <Text
                  style={{
                    color: colors.danger,
                    fontFamily: fonts.body,
                    fontSize: typography.sm.fontSize,
                    textAlign: 'center',
                  }}
                >
                  {erro}
                </Text>
              ) : null}
            </View>
            {botaoPrimario('Enviar link', enviarLink, carregando)}
            <Pressable
              onPress={() => router.push('/(auth)/login')}
              hitSlop={8}
              style={{ marginTop: spacing['2xl'] }}
            >
              <Text
                style={{
                  color: colors.mutedForeground,
                  fontFamily: fonts.body,
                  fontSize: typography.sm.fontSize,
                  textAlign: 'center',
                }}
              >
                Voltar para o login
              </Text>
            </Pressable>
          </>
        ) : null}

        {etapa === 'linkEnviado' ? (
          <>
            <Text
              style={{
                color: colors.foreground,
                fontFamily: fonts.displayBold,
                fontSize: typography.xl.fontSize,
                textAlign: 'center',
              }}
            >
              Enviamos um link para {email.trim()}
            </Text>
            <Text
              style={{
                color: colors.mutedForeground,
                fontFamily: fonts.body,
                fontSize: typography.sm.fontSize,
                textAlign: 'center',
                marginTop: spacing.sm,
              }}
            >
              Abra o link no seu e-mail e defina a nova senha.
            </Text>
            {botaoPrimario('Já usei o link', () => setEtapa('novaSenha'), false)}
            <Pressable
              onPress={() => {
                setEtapa('email');
                setErro(null);
              }}
              hitSlop={8}
              style={{ marginTop: spacing.xl }}
            >
              <Text
                style={{
                  color: colors.mutedForeground,
                  fontFamily: fonts.body,
                  fontSize: typography.sm.fontSize,
                  textAlign: 'center',
                }}
              >
                Usar outro e-mail
              </Text>
            </Pressable>
          </>
        ) : null}

        {etapa === 'novaSenha' ? (
          <>
            <Text
              style={{
                color: colors.foreground,
                fontFamily: fonts.displayBold,
                fontSize: typography.xl.fontSize,
              }}
            >
              Nova senha
            </Text>
            <View style={{ gap: spacing.sm, marginTop: spacing.xl }}>
              <CampoVidro
                focado={foco === 'senha'}
                aoFocar={() => setFoco('senha')}
                aoPerderFoco={() => setFoco(null)}
                icone={<LockIcon color={colors.mutedForeground} />}
                value={senha}
                onChangeText={setSenha}
                placeholder="Nova senha"
                secureTextEntry
              />
              <CampoVidro
                focado={foco === 'confirma'}
                aoFocar={() => setFoco('confirma')}
                aoPerderFoco={() => setFoco(null)}
                icone={<LockIcon color={colors.mutedForeground} />}
                value={confirma}
                onChangeText={setConfirma}
                placeholder="Confirmar senha"
                secureTextEntry
              />
              {erro ? (
                <Text
                  style={{
                    color: colors.danger,
                    fontFamily: fonts.body,
                    fontSize: typography.sm.fontSize,
                    textAlign: 'center',
                  }}
                >
                  {erro}
                </Text>
              ) : null}
            </View>
            {botaoPrimario('Salvar nova senha', definirNovaSenha, carregando)}
          </>
        ) : null}
    </ColunaAuth>
  );
}
