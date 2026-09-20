/**
 * Settings — REAL settings (no dead buttons):
 * - Tema: Sistema / Claro / Escuro (theme module setter + AsyncStorage key);
 * - Dados e armazenamento: cache size placeholder + "Limpar cache" (disabled
 *   until P9) + note;
 * - Sobre: version from app.json (expo-constants), "Desenvolvido pelo Turing
 *   USP", site link.
 */
import Constants from 'expo-constants';
import * as Linking from 'expo-linking';
import React, { useEffect, useState } from 'react';
import AsyncStorage from '@react-native-async-storage/async-storage';
import {
  Pressable,
  ScrollView,
  Text,
  View,
  type TextStyle,
  type ViewStyle,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import {
  carregarPreferencia,
  haptics,
  hapticsEnabled,
  setHapticsEnabled,
} from '../../lib/haptics';
import { fonts, useTheme } from '../../theme';
import {
  THEME_STORAGE_KEY,
  setScheme,
  type ThemePreference,
} from '../../theme';

const OPCOES_DE_TEMA: { valor: ThemePreference; rotulo: string }[] = [
  { valor: 'system', rotulo: 'Sistema' },
  { valor: 'light', rotulo: 'Claro' },
  { valor: 'dark', rotulo: 'Escuro' },
];

function ePreferencia(v: string | null): v is ThemePreference {
  return v === 'light' || v === 'dark' || v === 'system';
}

export default function Ajustes() {
  const { colors, glass, radius, spacing, typography } = useTheme();
  const insets = useSafeAreaInsets();

  const [preferencia, setPreferencia] = useState<ThemePreference>('system');
  const [vibracao, setVibracao] = useState(hapticsEnabled);

  useEffect(() => {
    // Initial read of the persisted preference (same AsyncStorage key the
    // ThemeProvider watches; setScheme notifies the provider on change).
    AsyncStorage.getItem(THEME_STORAGE_KEY)
      .then((raw) => {
        if (ePreferencia(raw)) setPreferencia(raw);
      })
      .catch(() => undefined);
  }, []);

  useEffect(() => {
    let ativo = true;
    void carregarPreferencia().then((v) => {
      if (ativo) setVibracao(v);
    });
    return () => {
      ativo = false;
    };
  }, []);

  function alternarVibracao() {
    const proximo = !vibracao;
    setVibracao(proximo);
    // Enable first, then buzz, so turning it ON confirms itself.
    void setHapticsEnabled(proximo).then(() => {
      if (proximo) void haptics.toggle();
    });
  }

  function escolherTema(valor: ThemePreference) {
    void haptics.toggle();
    setPreferencia(valor);
    void setScheme(valor);
  }

  function abrirSite() {
    void Linking.openURL('https://uspapo.turingusp.com').catch(
      () => undefined,
    );
  }

  const estiloSecao: ViewStyle = {
    // `colors.line` is a *base* colour meant to be taken with an opacity; used
    // raw it is solid #ffffff in the dark scheme. glass.hairline is the
    // calibrated edge every other glass surface uses.
    ...glass.surface,
    ...glass.hairline,
    borderRadius: radius.lg,
    gap: spacing.md,
    padding: spacing.lg,
    marginTop: spacing.lg,
  };

  const tituloSecao: TextStyle = {
    color: colors.mutedForeground,
    fontFamily: fonts.bodyBold,
    fontSize: typography.sm.fontSize,
    textTransform: 'uppercase',
    letterSpacing: 0.6,
  };

  return (
    <ScrollView
      contentContainerStyle={{
        padding: spacing.lg,
        paddingTop: insets.top + spacing.md,
        paddingBottom: insets.bottom + spacing.xl,
      }}
    >
      <Text
        style={{
          color: colors.foreground,
          fontFamily: fonts.displayBold,
          fontSize: typography['2xl'].fontSize,
        }}
      >
        Ajustes
      </Text>

      {/* Tema */}
      <View style={estiloSecao}>
        <Text style={tituloSecao}>Tema</Text>
        <View style={{ flexDirection: 'row', gap: spacing.xs }}>
          {OPCOES_DE_TEMA.map(({ valor, rotulo }) => {
            const ativa = preferencia === valor;
            return (
              <Pressable
                key={valor}
                onPress={() => escolherTema(valor)}
                style={({ pressed }) => [
                  {
                    alignItems: 'center',
                    backgroundColor: ativa
                      ? colors.brand
                      : glass.raised.backgroundColor,
                    borderColor: ativa ? colors.brand : colors.line,
                    borderRadius: radius.full,
                    borderWidth: 1,
                    flex: 1,
                    justifyContent: 'center',
                    minHeight: 44,
                    opacity: pressed ? 0.85 : 1,
                  },
                ]}
              >
                <Text
                  style={{
                    color: ativa
                      ? colors.brandForeground
                      : colors.foreground,
                    fontFamily: fonts.bodyBold,
                    fontSize: typography.sm.fontSize,
                  }}
                >
                  {rotulo}
                </Text>
              </Pressable>
            );
          })}
        </View>
      </View>

      {/* Vibração */}
      <View style={estiloSecao}>
        <Text style={tituloSecao}>Vibração</Text>
        <Pressable
          accessibilityRole="switch"
          accessibilityState={{ checked: vibracao }}
          onPress={alternarVibracao}
          style={({ pressed }) => [
            {
              alignItems: 'center',
              flexDirection: 'row',
              gap: spacing.md,
              minHeight: 44,
              opacity: pressed ? 0.85 : 1,
            },
          ]}
        >
          <View
            style={{
              alignItems: vibracao ? 'flex-end' : 'flex-start',
              backgroundColor: vibracao ? colors.brand : colors.line + '33',
              borderRadius: radius.full,
              height: 28,
              justifyContent: 'center',
              padding: 3,
              width: 48,
            }}
          >
            <View
              style={{
                backgroundColor: colors.brandForeground,
                borderRadius: radius.full,
                height: 22,
                width: 22,
              }}
            />
          </View>
          <Text
            style={{
              color: colors.foreground,
              flex: 1,
              fontFamily: fonts.body,
              fontSize: typography.base.fontSize,
            }}
          >
            Resposta tátil ao tocar, enviar e receber
          </Text>
        </Pressable>
        <Text
          style={{
            color: colors.faintForeground,
            fontFamily: fonts.body,
            fontSize: typography.xs.fontSize,
            marginTop: spacing.sm,
          }}
        >
          Sem efeito na versão web, que não vibra.
        </Text>
      </View>

      {/* Dados e armazenamento */}
      <View style={estiloSecao}>
        <Text style={tituloSecao}>Dados e armazenamento</Text>
        <View
          style={{ flexDirection: 'row', justifyContent: 'space-between' }}
        >
          <Text
            style={{
              color: colors.foreground,
              fontFamily: fonts.body,
              fontSize: typography.base.fontSize,
            }}
          >
            Tamanho do cache
          </Text>
          {/* Placeholder value: P9 reports the real cache size. */}
          <Text
            style={{
              color: colors.faintForeground,
              fontFamily: fonts.body,
              fontSize: typography.base.fontSize,
            }}
          >
            —
          </Text>
        </View>
        <Pressable
          disabled
          style={{
            alignItems: 'center',
            backgroundColor: colors.tint,
            borderRadius: radius.full,
            justifyContent: 'center',
            minHeight: 48,
            opacity: 0.4,
          }}
        >
          <Text
            style={{
              color: colors.foreground,
              fontFamily: fonts.bodyBold,
              fontSize: typography.base.fontSize,
            }}
          >
            Limpar cache
          </Text>
        </Pressable>
        <Text
          style={{
            color: colors.faintForeground,
            fontFamily: fonts.body,
            fontSize: typography.xs.fontSize,
          }}
        >
          A gestão do cache local chega com a persistência (P9).
        </Text>
      </View>

      {/* Sobre */}
      <View style={estiloSecao}>
        <Text style={tituloSecao}>Sobre</Text>
        <View
          style={{ flexDirection: 'row', justifyContent: 'space-between' }}
        >
          <Text
            style={{
              color: colors.foreground,
              fontFamily: fonts.body,
              fontSize: typography.base.fontSize,
            }}
          >
            Versão
          </Text>
          {/* Version from app.json (expo config inlined at build time). */}
          <Text
            style={{
              color: colors.faintForeground,
              fontFamily: fonts.body,
              fontSize: typography.base.fontSize,
            }}
          >
            {Constants.expoConfig?.version ?? '—'}
          </Text>
        </View>
        <Text
          style={{
            color: colors.mutedForeground,
            fontFamily: fonts.body,
            fontSize: typography.sm.fontSize,
          }}
        >
          Desenvolvido pelo Turing USP
        </Text>
        <Pressable onPress={abrirSite} hitSlop={8}>
          <Text
            style={{
              color: colors.brand,
              fontFamily: fonts.bodyBold,
              fontSize: typography.sm.fontSize,
            }}
          >
            uspapao.turingusp.com
          </Text>
        </Pressable>
      </View>
    </ScrollView>
  );
}
