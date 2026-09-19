/**
 * Login (email + password, show/hide, Google placeholder for P7).
 * Errors go through `mapAuthError` (lib/auth) — uniform pt-BR surface.
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

export default function Login() {
  const { colors, glass, radius, spacing, typography } = useTheme();
  const router = useRouter();
  const insets = useSafeAreaInsets();

  const [email, setEmail] = useState('');
  const [senha, setSenha] = useState('');
  const [mostrarSenha, setMostrarSenha] = useState(false);
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

  async function entrar() {
    if (carregando) return;
    if (!email.trim() || !senha) {
      setErro('Preencha o e-mail e a senha.');
      return;
    }
    setCarregando(true);
    setErro(null);
    try {
      const { error } = await supabase.auth.signInWithPassword({
        email: email.trim(),
        password: senha,
      });
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

  function entrarComGoogle() {
    // P7: wire expo-auth-session — native (Google auth with the usapo
    // scheme) and web (redirect flow). Placeholder on purpose for now.
    console.log('[uspapo] Entrar com Google — placeholder (P7 liga expo-auth-session)');
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
        <View style={{ gap: spacing.md }}>
          <Text
            style={{
              color: colors.foreground,
              fontSize: typography.xl.fontSize,
              fontWeight: '700',
            }}
          >
            Entrar
          </Text>
          <Text
            style={{
              color: colors.mutedForeground,
              fontSize: typography.sm.fontSize,
            }}
          >
            Use a sua conta da USP.
          </Text>
        </View>

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

        <View style={{ gap: spacing.sm, marginTop: spacing.xl }}>
          <Pressable
            onPress={entrar}
            disabled={carregando}
            style={({ pressed }) => [
              {
                alignItems: 'center',
                backgroundColor: colors.brand,
                borderRadius: radius.full,
                justifyContent: 'center',
                minHeight: 52,
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
                Entrar
              </Text>
            )}
          </Pressable>

          <View
            style={{
              flexDirection: 'row',
              alignItems: 'center',
              gap: spacing.sm,
              marginTop: spacing.xs,
            }}
          >
            <View
              style={{
                backgroundColor: colors.line,
                flex: 1,
                opacity: 0.15,
                height: StyleSheet.hairlineWidth + 1,
              }}
            />
            <Text
              style={{
                color: colors.faintForeground,
                fontSize: typography.xs.fontSize,
              }}
            >
              ou
            </Text>
            <View
              style={{
                backgroundColor: colors.line,
                flex: 1,
                opacity: 0.15,
                height: StyleSheet.hairlineWidth + 1,
              }}
            />
          </View>

          <Pressable
            onPress={entrarComGoogle}
            style={({ pressed }) => [
              {
                alignItems: 'center',
                backgroundColor: glass.raised.backgroundColor,
                borderColor: colors.line,
                borderRadius: radius.full,
                borderWidth: 1,
                justifyContent: 'center',
                minHeight: 52,
                opacity: pressed ? 0.85 : 1,
              },
            ]}
          >
            <Text
              style={{
                color: colors.foreground,
                fontSize: typography.base.fontSize,
                fontWeight: '600',
              }}
            >
              Entrar com Google
            </Text>
          </Pressable>
        </View>

        <View
          style={{
            flexDirection: 'row',
            justifyContent: 'space-between',
            marginTop: spacing['2xl'],
          }}
        >
          <Pressable
            onPress={() => router.push('/(auth)/reset')}
            hitSlop={8}
          >
            <Text
              style={{
                color: colors.mutedForeground,
                fontSize: typography.sm.fontSize,
              }}
            >
              Esqueci minha senha
            </Text>
          </Pressable>
          <Pressable
            onPress={() => router.push('/(auth)/register')}
            hitSlop={8}
          >
            <Text
              style={{
                color: colors.brand,
                fontSize: typography.sm.fontSize,
                fontWeight: '700',
              }}
            >
              Criar conta
            </Text>
          </Pressable>
        </View>
      </ScrollView>
    </KeyboardAvoidingView>
  );
}
