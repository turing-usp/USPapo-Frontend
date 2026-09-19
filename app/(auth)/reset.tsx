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
  KeyboardAvoidingView,
  Platform,
  Pressable,
  ScrollView,
  Text,
  TextInput,
  View,
  type TextStyle,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { haptics } from '../../lib/haptics';
import { mapAuthError } from '../../lib/auth';
import { supabase } from '../../lib/supabase';
import { useTheme } from '../../theme';
import { todasAsRegrasPassam } from './regrasSenha';

type Etapa = 'email' | 'linkEnviado' | 'novaSenha';

export default function Reset() {
  const { colors, glass, radius, spacing, typography } = useTheme();
  const router = useRouter();
  const insets = useSafeAreaInsets();

  const [etapa, setEtapa] = useState<Etapa>('email');
  const [email, setEmail] = useState('');
  const [senha, setSenha] = useState('');
  const [confirma, setConfirma] = useState('');
  const [carregando, setCarregando] = useState(false);
  const [erro, setErro] = useState<string | null>(null);

  const estiloCampo: TextStyle = {
    backgroundColor: glass.surface.backgroundColor,
    borderColor: colors.line,
    borderRadius: radius.full,
    borderWidth: 1,
    color: colors.foreground,
    fontSize: typography.base.fontSize,
    minHeight: 52,
    paddingVertical: 14,
    paddingHorizontal: 20,
  };

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
            fontSize: typography.base.fontSize,
            fontWeight: '700',
          }}
        >
          {rotulo}
        </Text>
      )}
    </Pressable>
  );

  return (
    <KeyboardAvoidingView
      style={{ flex: 1 }}
      behavior={Platform.OS === 'ios' ? 'padding' : undefined}
    >
      <ScrollView
        contentContainerStyle={{
          flexGrow: 1,
          justifyContent: 'center',
          padding: spacing.xl,
          paddingBottom: insets.bottom + spacing.xl,
        }}
      >
        {etapa === 'email' ? (
          <>
            <Text
              style={{
                color: colors.foreground,
                fontSize: typography.xl.fontSize,
                fontWeight: '700',
              }}
            >
              Recuperar senha
            </Text>
            <Text
              style={{
                color: colors.mutedForeground,
                fontSize: typography.sm.fontSize,
                marginTop: spacing.xs,
              }}
            >
              Informe seu e-mail e enviamos um link para redefinir a senha.
            </Text>
            <View style={{ gap: spacing.sm, marginTop: spacing.xl }}>
              <TextInput
                value={email}
                onChangeText={setEmail}
                placeholder="Email"
                placeholderTextColor={colors.faintForeground}
                autoCapitalize="none"
                autoCorrect={false}
                keyboardType="email-address"
                style={estiloCampo}
              />
              {erro ? (
                <Text
                  style={{
                    color: colors.danger,
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
                fontSize: typography.xl.fontSize,
                fontWeight: '700',
                textAlign: 'center',
              }}
            >
              Enviamos um link para {email.trim()}
            </Text>
            <Text
              style={{
                color: colors.mutedForeground,
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
                fontSize: typography.xl.fontSize,
                fontWeight: '700',
              }}
            >
              Nova senha
            </Text>
            <View style={{ gap: spacing.sm, marginTop: spacing.xl }}>
              <TextInput
                value={senha}
                onChangeText={setSenha}
                placeholder="Nova senha"
                placeholderTextColor={colors.faintForeground}
                secureTextEntry
                style={estiloCampo}
              />
              <TextInput
                value={confirma}
                onChangeText={setConfirma}
                placeholder="Confirmar senha"
                placeholderTextColor={colors.faintForeground}
                secureTextEntry
                style={estiloCampo}
              />
              {erro ? (
                <Text
                  style={{
                    color: colors.danger,
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
      </ScrollView>
    </KeyboardAvoidingView>
  );
}
