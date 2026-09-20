/**
 * Login (email + password, show/hide, Google placeholder for P7).
 *
 * Presentation ported from the old site login screen
 * (uspapo/site/app/(auth)/login/page.tsx): Turing wordmark above the title,
 * glass pill fields with the envelope/lock icons inside, brand pill button
 * with the glass shadow, centered "Esqueceu a senha?", "OU" divider, white
 * Google button and the centered footer link. The screen is transparent so
 * it reads on top of the <Backdrop /> rendered by the parent layout.
 *
 * Errors go through `mapAuthError` (lib/auth) — uniform pt-BR surface.
 */
import { useRouter } from 'expo-router';
import React, { useState } from 'react';
import {
  ActivityIndicator,
  Pressable,
  StyleSheet,
  Text,
  View,
} from 'react-native';

import CampoVidro from '../../components/CampoVidro';
import ColunaAuth from '../../components/ColunaAuth';
import {
  EnvelopeIcon,
  EyeIcon,
  EyeOffIcon,
  GoogleG,
  LockIcon,
  TuringMark,
} from '../../components/BrandMarks';
import { haptics } from '../../lib/haptics';
import { mapAuthError } from '../../lib/auth';
import { supabase } from '../../lib/supabase';
import { fonts, useTheme } from '../../theme';

export default function Login() {
  const { colors, glass, radius, spacing, typography, scheme } = useTheme();
  const router = useRouter();

  const [email, setEmail] = useState('');
  const [senha, setSenha] = useState('');
  const [mostrarSenha, setMostrarSenha] = useState(false);
  const [carregando, setCarregando] = useState(false);
  const [erro, setErro] = useState<string | null>(null);
  const [campoFocado, setCampoFocado] = useState<'email' | 'senha' | null>(
    null,
  );

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
    <ColunaAuth>
          {/* Wordmark + title (old: logo above "Entre com sua conta"). */}
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
            Entre com sua conta
          </Text>

          {/* Glass pill fields, icons inside, eye toggle on the right. */}
          <View style={{ gap: spacing.lg, marginTop: spacing['3xl'] }}>
            <CampoVidro
              focado={campoFocado === 'email'}
              aoFocar={() => setCampoFocado('email')}
              aoPerderFoco={() => setCampoFocado(null)}
              icone={<EnvelopeIcon size={20} color={colors.mutedForeground} />}
              value={email}
              onChangeText={setEmail}
              placeholder="Email"
              placeholderTextColor={colors.faintForeground}
              autoCapitalize="none"
              autoCorrect={false}
              keyboardType="email-address"
            />
            <CampoVidro
              focado={campoFocado === 'senha'}
              aoFocar={() => setCampoFocado('senha')}
              aoPerderFoco={() => setCampoFocado(null)}
              icone={<LockIcon size={20} color={colors.mutedForeground} />}
              value={senha}
              onChangeText={setSenha}
              placeholder="Senha"
              placeholderTextColor={colors.faintForeground}
              secureTextEntry={!mostrarSenha}
              botaoFinal={
                <Pressable
                  onPress={() => setMostrarSenha((v) => !v)}
                  hitSlop={8}
                  accessibilityLabel={
                    mostrarSenha ? 'Ocultar senha' : 'Mostrar senha'
                  }
                  style={{ marginStart: 8 }}
                >
                  {mostrarSenha ? (
                    <EyeOffIcon size={20} color={colors.mutedForeground} />
                  ) : (
                    <EyeIcon size={20} color={colors.mutedForeground} />
                  )}
                </Pressable>
              }
            />
            {erro ? (
              <Text
                role="alert"
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

          {/* Primary button (old: brand pill with shadow-md). */}
          <Pressable
            onPress={entrar}
            disabled={carregando}
            style={({ pressed }) => [
              glass.shadow,
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
                  fontFamily: fonts.body,
                  fontSize: typography.base.fontSize,
                }}
              >
                Entrar
              </Text>
            )}
          </Pressable>

          {/* Password reset (old: centered brand link). */}
          <Pressable
            onPress={() => router.push('/(auth)/reset')}
            hitSlop={8}
            style={{ alignSelf: 'center', marginTop: spacing.lg }}
          >
            <Text
              style={{
                color: colors.brand,
                fontFamily: fonts.body,
                fontSize: typography.sm.fontSize,
              }}
            >
              Esqueceu a senha?
            </Text>
          </Pressable>

          {/* "OU" divider (old: thin line / 15 + "OU"). */}
          <View
            style={{
              alignItems: 'center',
              flexDirection: 'row',
              gap: spacing.md,
              marginTop: spacing['2xl'],
            }}
          >
            <View
              style={{
                backgroundColor: colors.line,
                flex: 1,
                height: StyleSheet.hairlineWidth,
                opacity: 0.15,
              }}
            />
            <Text
              style={{
                color: colors.mutedForeground,
                fontFamily: fonts.body,
                fontSize: typography.sm.fontSize,
                letterSpacing: 1,
              }}
            >
              OU
            </Text>
            <View
              style={{
                backgroundColor: colors.line,
                flex: 1,
                height: StyleSheet.hairlineWidth,
                opacity: 0.15,
              }}
            />
          </View>

          {/* Google button (old: white pill, hairline border). */}
          <Pressable
            onPress={entrarComGoogle}
            disabled={carregando}
            style={({ pressed }) => [
              {
                alignItems: 'center',
                backgroundColor: colors.surfaceRaised,
                // old site used border-line/15 (navy 15% light / white 15% dark)
                borderColor: scheme === 'light' ? 'rgba(11,16,48,0.15)' : 'rgba(255,255,255,0.15)',
                borderWidth: 1,
                borderRadius: radius.full,
                flexDirection: 'row',
                gap: 12,
                justifyContent: 'center',
                minHeight: 52,
                marginTop: spacing['2xl'],
                opacity: carregando ? 0.7 : pressed ? 0.85 : 1,
              },
            ]}
          >
            <GoogleG size={20} />
            <Text
              style={{
                color: colors.foreground,
                fontFamily: fonts.body,
                fontSize: typography.sm.fontSize,
              }}
            >
              Continuar com o Google
            </Text>
          </Pressable>

          {/* Footer (old: centered "Não tem uma conta? Cadastre-se"). */}
          <View
            style={{
              alignItems: 'center',
              flexDirection: 'row',
              justifyContent: 'center',
              marginTop: spacing['3xl'],
            }}
          >
            <Text
              style={{
                color: colors.mutedForeground,
                fontFamily: fonts.body,
                fontSize: typography.sm.fontSize,
              }}
            >
              Não tem uma conta?{' '}
            </Text>
            <Pressable onPress={() => router.push('/(auth)/register')} hitSlop={8}>
              <Text
                style={{
                  color: colors.brand,
                  fontFamily: fonts.body,
                  fontSize: typography.sm.fontSize,
                }}
              >
                Cadastre-se
              </Text>
            </Pressable>
          </View>
    </ColunaAuth>
  );
}
