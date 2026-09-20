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
  useWindowDimensions,
  type TextStyle,
  type ViewStyle,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { ALTURA_CHROME } from '../../components/Chrome';
import Glass from '../../components/Glass';

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
  const { colors, glass, radius, layout, spacing, typography } = useTheme();
  const insets = useSafeAreaInsets();
  const { width: largura } = useWindowDimensions();

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

  // Section cards are blurred glass; the edge and tint come from <Glass>.
  const estiloSecao: ViewStyle = {
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
        // Old .app-container measure, centred, clearing the floating chrome.
        alignSelf: 'center',
        maxWidth: layout.containerMaxWidth,
        paddingHorizontal: layout.gutter(largura),
        paddingTop: insets.top + ALTURA_CHROME + spacing.md,
        paddingBottom: insets.bottom + spacing.xl,
        width: '100%',
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
      <Glass radius={radius.lg} style={estiloSecao}>
        <Text style={tituloSecao}>Tema</Text>
        <View style={{ flexDirection: 'row', gap: spacing.xs }}>
          {OPCOES_DE_TEMA.map(({ valor, rotulo }) => {
            const ativa = preferencia === valor;
            // Selected is a solid brand pill; the rest are the same blurred
            // glass as every other surface. They used to be an opaque fill
            // with a raw `colors.line` ring — solid white in the dark scheme —
            // which is why the control looked bolted on.
            const etiqueta = (
              <Text
                style={{
                  color: ativa ? colors.brandForeground : colors.foreground,
                  fontFamily: fonts.display,
                  fontSize: typography.sm.fontSize,
                }}
              >
                {rotulo}
              </Text>
            );
            const medidas = {
              alignItems: 'center' as const,
              flex: 1,
              justifyContent: 'center' as const,
              minHeight: 44,
            };
            return ativa ? (
              <Pressable
                key={valor}
                onPress={() => escolherTema(valor)}
                style={({ pressed }) => [
                  medidas,
                  {
                    backgroundColor: colors.brand,
                    borderRadius: radius.full,
                    opacity: pressed ? 0.85 : 1,
                  },
                ]}
              >
                {etiqueta}
              </Pressable>
            ) : (
              <Glass
                key={valor}
                onPress={() => escolherTema(valor)}
                radius={radius.full}
                semSombra
                style={medidas}
              >
                {etiqueta}
              </Glass>
            );
          })}
        </View>
      </Glass>

      {/* Vibração */}
      <Glass radius={radius.lg} style={estiloSecao}>
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
      </Glass>

      {/* Dados e armazenamento */}
      <Glass radius={radius.lg} style={estiloSecao}>
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
      </Glass>

      {/* Sobre */}
      <Glass radius={radius.lg} style={estiloSecao}>
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
      </Glass>
    </ScrollView>
  );
}
