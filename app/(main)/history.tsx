/**
 * History (P9 — light offline): the real grouped list.
 *
 * Data: `lerHistorico` (Supabase) merged with the offline cache
 * (lib/cache.fundirHistorico): the server wins per row when its
 * `atualizada_em` is >= the cache's; the cache only wins when it is
 * strictly newer (an offline completion not yet synced) and — when
 * Supabase is unreachable — fills the whole list. The merged list is
 * written back to the cache (write-through), so the next offline render
 * is honest.
 *
 * - rows with `resposta = null` render as pending (the P9 rule);
 * - pull-to-refresh re-runs the load: when offline it is a reload from
 *   the cache, with the pt-BR note "mostrando o último cache";
 * - search filters the loaded window locally (same honest scope as
 *   lib/conversations.buscar — no full-table scan, no FTS in light P9);
 * - per-item long-press is still a placeholder (favorite/rename/delete
 *   with 6s undo is out of the light-offline scope).
 */
import { useRouter } from 'expo-router';
import React, { useCallback, useEffect, useMemo, useState } from 'react';
import {
  FlatList,
  RefreshControl,
  Text,
  View,
  useWindowDimensions,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { ALTURA_CHROME } from '../../components/Chrome';
import CampoVidro from '../../components/CampoVidro';
import Container from '../../components/Container';
import Glass from '../../components/Glass';

import { carregarHistoricoOffline, fundirHistorico, salvarConversas } from '../../lib/cache';
import { lerHistorico, type Conversa } from '../../lib/conversations';
import { marcarFalhaRede, marcarSucessoRede } from '../../lib/offline';
import { supabase } from '../../lib/supabase';
import { fonts, useTheme } from '../../theme';

const GRUPOS = [
  'Favoritas',
  'Hoje',
  'Ontem',
  'Últimos 7 dias',
  'Últimos 30 dias',
  'Anteriores',
] as const;

type Grupo = (typeof GRUPOS)[number];

const DIA_MS = 86_400_000;

function inicioDoDia(d: Date): number {
  const x = new Date(d);
  x.setHours(0, 0, 0, 0);
  return x.getTime();
}

/** The display group of one row (Favoritas always wins over the date). */
function grupoDa(conversa: Conversa, agora: number): Grupo {
  if (conversa.favorita) return 'Favoritas';
  const quando = new Date(conversa.atualizada_em).getTime();
  if (Number.isNaN(quando)) return 'Anteriores';
  const hoje = inicioDoDia(new Date(agora));
  if (quando >= hoje) return 'Hoje';
  if (quando >= hoje - DIA_MS) return 'Ontem';
  if (quando >= hoje - 7 * DIA_MS) return 'Últimos 7 dias';
  if (quando >= hoje - 30 * DIA_MS) return 'Últimos 30 dias';
  return 'Anteriores';
}

/** One FlatList row: a group header or a conversation item. */
type Linha =
  | { tipo: 'grupo'; id: string; texto: Grupo }
  | { tipo: 'item'; id: string; conversa: Conversa };

/** Static skeleton rows (the loading state only). */
const LINHAS: Linha[] = GRUPOS.flatMap((grupo, i) =>
  [0, 1].map((n) => ({
    tipo: 'grupo' as const,
    id: `grupo:${grupo}-${n}`,
    texto: grupo,
  })),
);

export default function Historico() {
  const { colors, layout, radius, spacing, typography } = useTheme();
  const { width: largura } = useWindowDimensions();
  const insets = useSafeAreaInsets();
  const router = useRouter();

  const [busca, setBusca] = useState('');
  const [buscaFocada, setBuscaFocada] = useState(false);
  /** null = still loading (the skeleton); [] = loaded and empty. */
  const [conversas, setConversas] = useState<Conversa[] | null>(null);
  /** True when the last load could not reach Supabase (cache only). */
  const [doCache, setDoCache] = useState(false);
  const [atualizando, setAtualizando] = useState(false);

  /**
   * The load (mount + pull-to-refresh): Supabase first; when it fails the
   * cache fills the list and the honest pt-BR note shows ("mostrando o
   * último cache"). A successful read is also proof of connectivity and
   * keeps the cache fresh (write-through).
   */
  const carregar = useCallback(async () => {
    setAtualizando(true);
    try {
      const { data } = await supabase.auth.getSession();
      const userId = data.session?.user?.id ?? '';
      if (userId === '') return;

      let servidor: Conversa[] = [];
      let chegouDoServidor = false;
      try {
        servidor = await lerHistorico(userId);
        chegouDoServidor = true;
      } catch (err) {
        console.warn('[history] lerHistorico falhou (offline?):', err);
      }

      let cache: Conversa[] = [];
      try {
        cache = await carregarHistoricoOffline(userId);
      } catch {
        cache = [];
      }

      if (chegouDoServidor) {
        marcarSucessoRede();
        try {
          await salvarConversas(userId, servidor);
        } catch (err) {
          console.warn('[history] write-through no cache ignorado:', err);
        }
      } else {
        marcarFalhaRede();
      }

      setConversas(fundirHistorico(servidor, cache));
      setDoCache(!chegouDoServidor);
    } finally {
      setAtualizando(false);
    }
  }, []);

  useEffect(() => {
    void carregar();
  }, [carregar]);

  /** Search over the loaded window (local substring, case-insensitive). */
  const filtradas = useMemo(() => {
    if (conversas === null) return null;
    const termo = busca.trim().toLowerCase();
    if (termo === '') return conversas;
    return conversas.filter(
      (c) => c.pergunta.toLowerCase().includes(termo) || (c.resposta ?? '').toLowerCase().includes(termo),
    );
  }, [conversas, busca]);

  const linhas = useMemo<Linha[]>(() => {
    if (filtradas === null) return LINHAS;
    const porGrupo = new Map<Grupo, Conversa[]>();
    for (const g of GRUPOS) porGrupo.set(g, []);
    const agora = Date.now();
    for (const c of filtradas) porGrupo.get(grupoDa(c, agora))!.push(c);
    const out: Linha[] = [];
    for (const g of GRUPOS) {
      const itens = porGrupo.get(g)!;
      if (itens.length === 0) continue;
      out.push({ tipo: 'grupo', id: `grupo:${g}`, texto: g });
      for (const c of itens) out.push({ tipo: 'item', id: c.id, conversa: c });
    }
    return out;
  }, [filtradas]);

  const vazio = conversas !== null && conversas.length === 0;

  return (
    // No canvas fill: an opaque background here would hide the shared
    // backdrop that Tela paints behind every screen.
    <View style={{ flex: 1 }}>
      <Container
        style={{
          gap: spacing.md,
          // Clear the floating chrome (hamburger / avatar) above.
          paddingTop: insets.top + ALTURA_CHROME + spacing.md,
          paddingBottom: spacing.md,
        }}
      >
        <Text
          style={{
            color: colors.foreground,
            fontFamily: fonts.displayBold,
            fontSize: typography['2xl'].fontSize,
          }}
        >
          Histórico
        </Text>
        <CampoVidro
          focado={buscaFocada}
          aoFocar={() => setBuscaFocada(true)}
          aoPerderFoco={() => setBuscaFocada(false)}
          value={busca}
          onChangeText={setBusca}
          placeholder="Buscar nas conversas"
          autoCapitalize="none"
          autoCorrect={false}
        />
        {/* The honest offline note (pull-to-refresh became "reload from
            cache"). */}
        {doCache && conversas !== null && conversas.length > 0 ? (
          <Text
            style={{
              color: colors.mutedForeground,
              fontFamily: fonts.body,
              fontSize: typography.xs.fontSize,
              textAlign: 'center',
            }}
          >
            mostrando o último cache — sem conexão
          </Text>
        ) : null}
        {vazio && filtradas !== null && filtradas.length === 0 ? (
          <Text
            style={{
              color: colors.mutedForeground,
              fontFamily: fonts.body,
              fontSize: typography.sm.fontSize,
              textAlign: 'center',
            }}
          >
            {busca.trim() === ''
              ? 'Suas conversas aparecem aqui'
              : 'Nenhuma conversa encontrada'}
          </Text>
        ) : null}
      </Container>

      <FlatList
        data={linhas}
        keyExtractor={(item) => item.id}
        contentContainerStyle={{
          // Same 64rem measure as the header above (old .app-container).
          alignSelf: 'center',
          maxWidth: layout.containerMaxWidth,
          paddingHorizontal: layout.gutter(largura),
          paddingTop: spacing.sm,
          paddingBottom: insets.bottom + spacing.xl,
          width: '100%',
        }}
        // Pull-to-refresh: re-runs the load (Supabase first; when offline
        // it is the reload-from-cache).
        refreshControl={
          <RefreshControl
            refreshing={atualizando}
            tintColor={colors.brand}
            onRefresh={() => {
              void carregar();
            }}
          />
        }
        renderItem={({ item }) => {
          if (item.tipo === 'grupo') {
            return (
              <View
                style={{
                  marginBottom: spacing.sm,
                  marginTop: item.id === 'grupo:Favoritas' ? 0 : spacing.lg,
                }}
              >
                <Text
                  style={{
                    color: colors.mutedForeground,
                    fontFamily: fonts.bodyBold,
                    fontSize: typography.sm.fontSize,
                    textTransform: 'uppercase',
                    letterSpacing: 0.6,
                  }}
                >
                  {item.texto}
                </Text>
              </View>
            );
          }
          const c = item.conversa;
          return (
            <Glass
              onPress={() => router.push(`/(main)/chat/${c.id}`)}
              onLongPress={() => {
                // Out of the light-offline scope: favorite/rename/delete
                // with 6s undo (kept as the placeholder it started as).
                console.log('[uspapo] Histórico — ação do item (long-press): placeholder');
              }}
              radius={radius.md}
              style={{
                marginBottom: spacing.xs,
                minHeight: 56,
                paddingVertical: 12,
                paddingHorizontal: 14,
              }}
            >
              <View style={{ flexDirection: 'row', alignItems: 'center', gap: spacing.sm }}>
                <Text
                  numberOfLines={2}
                  style={{
                    flex: 1,
                    color: colors.foreground,
                    fontFamily: fonts.body,
                    fontSize: typography.sm.fontSize,
                  }}
                >
                  {c.pergunta}
                </Text>
                {/* The P9 pending rule: resposta null = still pending. */}
                {c.resposta === null ? (
                  <Text
                    style={{
                      color: colors.danger,
                      fontFamily: fonts.bodyBold,
                      fontSize: typography.xs.fontSize,
                      textTransform: 'uppercase',
                    }}
                  >
                    pendente
                  </Text>
                ) : null}
              </View>
            </Glass>
          );
        }}
      />
    </View>
  );
}
