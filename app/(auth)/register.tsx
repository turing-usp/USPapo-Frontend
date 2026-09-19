/**
 * Register (nome / email / senha / confirma) with the LIVE 5-rule password
 * checklist (exact pt-BR labels ported from the old site) and a post-signUp
 * success state ("Confira seu e-mail para confirmar a conta").
 */
import { useRouter } from 'expo-router';
import React, { useState } from 'react';
import {
  ActivityIndicator,
  KeyboardAvoidingView,
  Platform,
  Pressable,
  ScrollView,
  StyleSheet,
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
import {
  REGRAS_DE_SENHA,
  checarSenha,
  todasAsRegrasPassam,
} from './regrasSenha';

export default function Cadastro() {
  const { colors, glass, radius, spacing, typography } = useTheme();
  const router = useRouter();
  const insets = useSafeAreaInsets();

  const [nome, setNome] = useState('');
  const [email, setEmail] = useState('');
  const [senha, setSenha] = useState('');
  const [confirma, setConfirma] = useState('');
  const [mostrarSenha, setMostrarSenha] = useState(false);
  const [carregando, setCarregando] = useState(false);
  const [erro, setErro] = useState<string | null>(null);
  const [sucesso, setSucesso] = useState(false);

  const regras = checarSenha(senha);

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

  async function cadastrar() {
    if (carregando) return;
    if (!nome.trim()) {
      setErro('Informe seu nome.');
      return;
    }
    if (!email.trim()) {
      setErro('Informe seu e-mail.');
      return;
    }
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
      const { error } = await supabase.auth.signUp({
        email: email.trim(),
        password: senha,
        options: {
          data: { nome: nome.trim() },
        },
      });
      if (error) {
        setErro(mapAuthError(error));
        void haptics.error();
        return;
      }
      void haptics.send();
      setSucesso(true);
    } catch (e) {
      setErro(mapAuthError(e));
      void haptics.error();
    } finally {
      setCarregando(false);
    }
  }

  if (sucesso) {
    return (
      <View
        style={{
          flex: 1,
          alignItems: 'center',
          justifyContent: 'center',
          gap: spacing.lg,
          padding: spacing.xl,
          paddingBottom: insets.bottom + spacing.xl,
        }}
      >
        <View
          style={[
            glass.surface,
            glass.hairline,
            glass.shadow,
            {
              alignItems: 'center',
              borderRadius: radius.xl,
              gap: spacing.md,
              padding: spacing['2xl'],
              width: '100%',
            },
          ]}
        >
          <Text
            style={{
              color: colors.foreground,
              fontSize: typography.xl.fontSize,
              fontWeight: '700',
              textAlign: 'center',
            }}
          >
            Confira seu e-mail para confirmar a conta
          </Text>
          <Text
            style={{
              color: colors.mutedForeground,
              fontSize: typography.sm.fontSize,
              textAlign: 'center',
            }}
          >
            Enviamos um link de confirmação para {email.trim()}.
          </Text>
          <Pressable
            onPress={() => router.push('/(auth)/login')}
            style={({ pressed }) => [
              {
                alignItems: 'center',
                backgroundColor: colors.brand,
                borderRadius: radius.full,
                justifyContent: 'center',
                minHeight: 52,
                marginTop: spacing.sm,
                opacity: pressed ? 0.85 : 1,
              },
            ]}
          >
            <Text
              style={{
                color: colors.brandForeground,
                fontSize: typography.base.fontSize,
                fontWeight: '700',
              }}
            >
              Ir para o login
            </Text>
          </Pressable>
        </View>
      </View>
    );
  }

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
        <Text
          style={{
            color: colors.foreground,
            fontSize: typography.xl.fontSize,
            fontWeight: '700',
          }}
        >
          Criar conta
        </Text>

        <View style={{ gap: spacing.sm, marginTop: spacing.xl }}>
          <TextInput
            value={nome}
            onChangeText={setNome}
            placeholder="Nome"
            placeholderTextColor={colors.faintForeground}
            autoCapitalize="words"
            style={estiloCampo}
          />
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
          <View
            style={{
              flexDirection: 'row',
              alignItems: 'center',
              justifyContent: 'space-between',
              backgroundColor: glass.surface.backgroundColor,
              borderColor: colors.line,
              borderRadius: radius.full,
              borderWidth: 1,
              paddingVertical: 14,
              paddingHorizontal: 20,
              minHeight: 52,
            }}
          >
            <TextInput
              value={senha}
              onChangeText={setSenha}
              placeholder="Senha"
              placeholderTextColor={colors.faintForeground}
              secureTextEntry={!mostrarSenha}
              style={{
                flex: 1,
                color: colors.foreground,
                fontSize: typography.base.fontSize,
              }}
            />
            <Pressable
              onPress={() => setMostrarSenha((v) => !v)}
              hitSlop={8}
              accessibilityLabel={
                mostrarSenha ? 'Ocultar senha' : 'Mostrar senha'
              }
            >
              <Text
                style={{
                  color: colors.brand,
                  fontSize: typography.sm.fontSize,
                  fontWeight: '600',
                }}
              >
                {mostrarSenha ? 'Ocultar' : 'Mostrar'}
              </Text>
            </Pressable>
          </View>

          {/* Live 5-rule checklist — UX only; the server-side hook is the
              source of truth (plan §4, finding 007). */}
          <View style={{ gap: spacing.xs, marginTop: spacing.xs }}>
            {REGRAS_DE_SENHA.map(({ chave, rotulo }) => {
              const ok = regras[chave];
              return (
                <View
                  key={chave}
                  style={{ flexDirection: 'row', alignItems: 'center', gap: spacing.xs }}
                >
                  <Text
                    style={{
                      color: ok ? colors.brand : colors.faintForeground,
                      fontSize: typography.sm.fontSize,
                      fontWeight: '700',
                    }}
                  >
                    {ok ? '✓' : '•'}
                  </Text>
                  <Text
                    style={{
                      color: ok ? colors.foreground : colors.mutedForeground,
                      fontSize: typography.sm.fontSize,
                    }}
                  >
                    {rotulo}
                  </Text>
                </View>
              );
            })}
          </View>

          <TextInput
            value={confirma}
            onChangeText={setConfirma}
            placeholder="Confirmar senha"
            placeholderTextColor={colors.faintForeground}
            secureTextEntry={!mostrarSenha}
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

        <Pressable
          onPress={cadastrar}
          disabled={carregando}
          style={({ pressed }) => [
            {
              alignItems: 'center',
              backgroundColor: colors.brand,
              borderRadius: radius.full,
              justifyContent: 'center',
              minHeight: 52,
              marginTop: spacing.xl,
              opacity: carregando ? 0.7 : pressed ? 0.85 : 1,
            },
          ]}
        >
          {carregando ? (
            <ActivityIndicator color={colors.brandForeground} />
          ) : (
            <Text
              style={{
                color: colors.brandForeground,
                fontSize: typography.base.fontSize,
                fontWeight: '700',
              }}
            >
              Cadastrar
            </Text>
          )}
        </Pressable>

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
            Já tem conta? Entrar
          </Text>
        </Pressable>
      </ScrollView>
    </KeyboardAvoidingView>
  );
}
