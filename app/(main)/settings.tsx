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

import { useTheme } from '../../theme';
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

  useEffect(() => {
    // Initial read of the persisted preference (same AsyncStorage key the
    // ThemeProvider watches; setScheme notifies the provider on change).
    AsyncStorage.getItem(THEME_STORAGE_KEY)
      .then((raw) => {
        if (ePreferencia(raw)) setPreferencia(raw);
      })
      .catch(() => undefined);
  }, []);

  function escolherTema(valor: ThemePreference) {
    setPreferencia(valor);
    void setScheme(valor);
  }

  function abrirSite() {
    void Linking.openURL('https://uspapo.turingusp.com').catch(
      () => undefined,
    );
  }

  const estiloSecao: ViewStyle = {
    backgroundColor: glass.surface.backgroundColor,
    borderColor: colors.line,
    borderRadius: radius.lg,
    borderWidth: 1,
    gap: spacing.md,
    padding: spacing.lg,
    marginTop: spacing.lg,
  };

  const tituloSecao: TextStyle = {
    color: colors.mutedForeground,
    fontSize: typography.sm.fontSize,
    fontWeight: '700',
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
          fontSize: typography['2xl'].fontSize,
          fontWeight: '800',
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
                    fontSize: typography.sm.fontSize,
                    fontWeight: '600',
                  }}
                >
                  {rotulo}
                </Text>
              </Pressable>
            );
          })}
        </View>
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
              fontSize: typography.base.fontSize,
            }}
          >
            Tamanho do cache
          </Text>
          {/* Placeholder value: P9 reports the real cache size. */}
          <Text
            style={{
              color: colors.faintForeground,
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
              fontSize: typography.base.fontSize,
              fontWeight: '600',
            }}
          >
            Limpar cache
          </Text>
        </Pressable>
        <Text
          style={{
            color: colors.faintForeground,
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
              fontSize: typography.base.fontSize,
            }}
          >
            Versão
          </Text>
          {/* Version from app.json (expo config inlined at build time). */}
          <Text
            style={{
              color: colors.faintForeground,
              fontSize: typography.base.fontSize,
            }}
          >
            {Constants.expoConfig?.version ?? '—'}
          </Text>
        </View>
        <Text
          style={{
            color: colors.mutedForeground,
            fontSize: typography.sm.fontSize,
          }}
        >
          Desenvolvido pelo Turing USP
        </Text>
        <Pressable onPress={abrirSite} hitSlop={8}>
          <Text
            style={{
              color: colors.brand,
              fontSize: typography.sm.fontSize,
              fontWeight: '600',
            }}
          >
            uspapao.turingusp.com
          </Text>
        </Pressable>
      </View>
    </ScrollView>
  );
}
