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
  View,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import CampoVidro from '../../components/CampoVidro';
import {
  EnvelopeIcon,
  EyeIcon,
  EyeOffIcon,
  LockIcon,
  TuringMark,
  UserIcon,
} from '../../components/BrandMarks';
import { haptics } from '../../lib/haptics';
import { mapAuthError } from '../../lib/auth';
import { supabase } from '../../lib/supabase';
import { fonts, useTheme } from '../../theme';
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
  /** Which pill owns the brand focus ring. */
  const [foco, setFoco] = useState<string | null>(null);

  const regras = checarSenha(senha);

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
              fontFamily: fonts.displayBold,
              fontSize: typography.xl.fontSize,
              textAlign: 'center',
            }}
          >
            Confira seu e-mail para confirmar a conta
          </Text>
          <Text
            style={{
              color: colors.mutedForeground,
              fontFamily: fonts.body,
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
                fontFamily: fonts.bodyBold,
                fontSize: typography.base.fontSize,
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
        {/* Same masthead as login: wordmark over a centred Geom title. */}
        <View style={{ alignItems: 'center' }}>
          <TuringMark size={144} />
        </View>
        <Text
          style={{
            alignSelf: 'center',
            color: colors.foreground,
            fontFamily: fonts.displayBold,
            fontSize: typography.xl.fontSize,
            letterSpacing: 0.5,
            marginTop: spacing.xl,
            textAlign: 'center',
          }}
        >
          Criar conta
        </Text>

        <View style={{ gap: spacing.sm, marginTop: spacing.xl }}>
          <CampoVidro
            focado={foco === 'nome'}
            aoFocar={() => setFoco('nome')}
            aoPerderFoco={() => setFoco(null)}
            icone={<UserIcon color={colors.mutedForeground} />}
            value={nome}
            onChangeText={setNome}
            placeholder="Nome"
            autoCapitalize="words"
          />
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
          <CampoVidro
            focado={foco === 'senha'}
            aoFocar={() => setFoco('senha')}
            aoPerderFoco={() => setFoco(null)}
            icone={<LockIcon color={colors.mutedForeground} />}
            value={senha}
            onChangeText={setSenha}
            placeholder="Senha"
            secureTextEntry={!mostrarSenha}
            botaoFinal={
              <Pressable
                onPress={() => setMostrarSenha((v) => !v)}
                hitSlop={8}
                accessibilityLabel={mostrarSenha ? 'Ocultar senha' : 'Mostrar senha'}
              >
                {mostrarSenha ? (
                  <EyeOffIcon color={colors.mutedForeground} />
                ) : (
                  <EyeIcon color={colors.mutedForeground} />
                )}
              </Pressable>
            }
          />

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
                      fontFamily: fonts.bodyBold,
                      fontSize: typography.sm.fontSize,
                    }}
                  >
                    {ok ? '✓' : '•'}
                  </Text>
                  <Text
                    style={{
                      color: ok ? colors.foreground : colors.mutedForeground,
                      fontFamily: fonts.body,
                      fontSize: typography.sm.fontSize,
                    }}
                  >
                    {rotulo}
                  </Text>
                </View>
              );
            })}
          </View>

          <CampoVidro
            focado={foco === 'confirma'}
            aoFocar={() => setFoco('confirma')}
            aoPerderFoco={() => setFoco(null)}
            icone={<LockIcon color={colors.mutedForeground} />}
            value={confirma}
            onChangeText={setConfirma}
            placeholder="Confirmar senha"
            secureTextEntry={!mostrarSenha}
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
                fontFamily: fonts.bodyBold,
                fontSize: typography.base.fontSize,
              }}
            >
              Cadastrar
            </Text>
          )}
        </Pressable>

        {/* Same footer shape as login: muted question, brand-orange action. */}
        <View
          style={{
            alignItems: 'center',
            flexDirection: 'row',
            justifyContent: 'center',
            marginTop: spacing['2xl'],
          }}
        >
          <Text
            style={{
              color: colors.mutedForeground,
              fontFamily: fonts.body,
              fontSize: typography.sm.fontSize,
            }}
          >
            Já tem conta?{' '}
          </Text>
          <Pressable onPress={() => router.push('/(auth)/login')} hitSlop={8}>
            <Text
              style={{
                color: colors.brand,
                fontFamily: fonts.body,
                fontSize: typography.sm.fontSize,
              }}
            >
              Entrar
            </Text>
          </Pressable>
        </View>
      </ScrollView>
    </KeyboardAvoidingView>
  );
}
