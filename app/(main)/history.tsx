/**
 * History: pull-to-refresh (no-op until the cache lands), search input
 * (placeholder — P9 wires SQLite FTS search), grouped headers skeleton
 * (Favoritas/Hoje/Ontem/Últimos 7 dias/Últimos 30 dias/Anteriores), empty
 * state "Suas conversas aparecem aqui" and per-item long-press placeholder
 * (P9: favorite/rename/delete-with-undo).
 */
import React, { useMemo, useState } from 'react';
import {
  FlatList,
  Pressable,
  RefreshControl,
  StyleSheet,
  Text,
  TextInput,
  View,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { useTheme } from '../../theme';

const GRUPOS = [
  'Favoritas',
  'Hoje',
  'Ontem',
  'Últimos 7 dias',
  'Últimos 30 dias',
  'Anteriores',
] as const;

type LinhaEsqueleto = {
  id: string;
  grupo: string;
  grupoAnterior?: string;
};

/** Static skeleton rows: two ghost rows per group. P9 replaces this with
 * the real grouped cache list. */
const LINHAS: LinhaEsqueleto[] = GRUPOS.flatMap((grupo, i) =>
  [0, 1].map((n) => ({
    id: `${grupo}-${n}`,
    grupo,
    grupoAnterior: i === 0 ? undefined : GRUPOS[i - 1],
  })),
);

export default function Historico() {
  const { colors, glass, radius, spacing, typography } = useTheme();
  const insets = useSafeAreaInsets();
  const [busca, setBusca] = useState('');

  const itens = useMemo(() => LINHAS, []);

  return (
    <View style={{ flex: 1, backgroundColor: colors.canvas }}>
      <View
        style={{
          padding: spacing.lg,
          gap: spacing.md,
          paddingTop: insets.top + spacing.md,
        }}
      >
        <Text
          style={{
            color: colors.foreground,
            fontSize: typography['2xl'].fontSize,
            fontWeight: '800',
          }}
        >
          Histórico
        </Text>
        <TextInput
          value={busca}
          onChangeText={setBusca}
          placeholder="Buscar nas conversas"
          placeholderTextColor={colors.faintForeground}
          autoCapitalize="none"
          autoCorrect={false}
          style={[
            glass.surface,
            glass.hairline,
            {
              borderRadius: radius.full,
              color: colors.foreground,
              fontSize: typography.base.fontSize,
              minHeight: 48,
              paddingVertical: 12,
              paddingHorizontal: 20,
            },
          ]}
        />
        {/* Empty state: there is no cached data yet (P9 fills the groups). */}
        <Text
          style={{
            color: colors.mutedForeground,
            fontSize: typography.sm.fontSize,
            textAlign: 'center',
          }}
        >
          Suas conversas aparecem aqui
        </Text>
      </View>

      <FlatList
        data={itens}
        keyExtractor={(item) => item.id}
        contentContainerStyle={{
          padding: spacing.lg,
          paddingBottom: insets.bottom + spacing.xl,
        }}
        stickyHeaderIndices={[]}
        // Pull-to-refresh: wired to the cache refresh in P9; no-op today.
        refreshControl={
          <RefreshControl
            refreshing={false}
            tintColor={colors.brand}
            onRefresh={() => undefined}
          />
        }
        renderItem={({ item }) => (
          <View>
            {item.grupoAnterior === undefined && (
              <View
                style={{
                  marginBottom: spacing.sm,
                  marginTop: item.grupo === 'Favoritas' ? 0 : spacing.lg,
                }}
              >
                <TextoGrupo
                  texto={item.grupo}
                  cor={colors.mutedForeground}
                />
              </View>
            )}
            <Pressable
              onLongPress={() => {
                // P9: long-press action (favorite/rename/delete with 6s undo).
                console.log('[uspapo] Histórico — ação do item (long-press): placeholder (P9)');
              }}
              style={[
                glass.surface,
                glass.hairline,
                {
                  borderRadius: radius.md,
                  height: 44,
                  marginBottom: spacing.xs,
                  opacity: 0.75,
                },
              ]}
            />
          </View>
        )}
      />
    </View>
  );
}

function TextoGrupo({ texto, cor }: { texto: string; cor: string }) {
  const { typography } = useTheme();
  return (
    <Text
      style={{
        color: cor,
        fontSize: typography.sm.fontSize,
        fontWeight: '700',
        textTransform: 'uppercase',
        letterSpacing: 0.6,
      }}
    >
      {texto}
    </Text>
  );
}
