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
import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  FlatList,
  Pressable,
  RefreshControl,
  Text,
  TextInput,
  View,
  useWindowDimensions,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { ALTURA_CHROME } from '../../components/Chrome';
import { BackdropDesvanecido } from '../../components/Backdrop';
import CampoVidro from '../../components/CampoVidro';
import { MenuConversa } from '../../components/MenuConversa';
import { StarIcon } from '../../components/BrandMarks';
import Container from '../../components/Container';
import Glass from '../../components/Glass';

import {
  carregarHistoricoOffline,
  conversaPorIdOffline,
  fundirHistorico,
  removerConversa,
  salvarConversa,
  salvarConversas,
} from '../../lib/cache';
import {
  excluir,
  favoritar,
  lerHistorico,
  renomear,
  rotuloDa,
  type Conversa,
} from '../../lib/conversations';
import { haptics } from '../../lib/haptics';
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

/** One FlatList row: a group header, a conversation, or a skeleton block. */
type Linha =
  | { tipo: 'grupo'; id: string; texto: Grupo }
  | { tipo: 'item'; id: string; conversa: Conversa }
  | { tipo: 'esqueleto'; id: string; largura: `${number}%` };

/**
 * The loading state.
 *
 * It used to be built from GRUPOS, which meant the first paint of the screen
 * spelled out "Favoritas / Hoje / Ontem / Últimos 7 dias / Últimos 30 dias /
 * Anteriores" — twice each — as if the student had conversations in every
 * bucket. Those headings then vanished once the real (often empty) list
 * arrived. A skeleton must not assert anything, so these are plain blocks of
 * varying width and carry no text at all.
 */
const LARGURAS: `${number}%`[] = ['72%', '54%', '83%', '61%', '77%', '48%'];
const LINHAS: Linha[] = LARGURAS.map((largura, i) => ({
  tipo: 'esqueleto' as const,
  id: `esqueleto:${i}`,
  largura,
}));

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
  /**
   * The load reached neither the server NOR a usable cache. It is a separate
   * state from "loaded and empty" on purpose: the screen used to render the
   * "Suas conversas aparecem aqui" copy in both cases, so a student whose
   * history simply failed to load was told they had never had a conversation.
   */
  const [falhouCarga, setFalhouCarga] = useState(false);
  const [atualizando, setAtualizando] = useState(false);
  /** The row removed from the UI, still inside its undo window. */
  const [pendente, setPendente] = useState<Conversa | null>(null);
  /** Inline notice (the favourites cap the DB trigger enforces). */
  const [aviso, setAviso] = useState<string | null>(null);
  /** The row being renamed in place, and the text being typed into it. */
  const [editandoId, setEditandoId] = useState<string | null>(null);
  const [novoTitulo, setNovoTitulo] = useState('');
  const temporizador = useRef<ReturnType<typeof setTimeout> | null>(null);
  /** The id inside the undo window, readable from the unmount cleanup. */
  const pendenteRef = useRef<string | null>(null);

  /**
   * Write-through for an edit the student just made.
   *
   * The cache is the other half of what the history renders
   * (`fundirHistorico` merges it with the server), so a rename or a
   * favourite that only lands on the server leaves a stale row here — and
   * the merge hands the stale one back whenever its timestamp is not older.
   * Failing to mirror is not worth an error: the next successful load
   * rewrites the row anyway.
   */
  const espelharNoCache = useCallback(
    async (uid: string, id: string, aplicar: (c: Conversa) => Conversa) => {
      try {
        const atual = await conversaPorIdOffline(uid, id);
        if (!atual) return;
        await salvarConversa({
          ...aplicar(atual),
          atualizada_em: new Date().toISOString(),
          user_id: uid,
        });
      } catch (err) {
        console.warn('[history] espelho no cache ignorado:', err);
      }
    },
    [],
  );

  /**
   * Commits one delete: the server row AND the local cache.
   *
   * Both halves matter. `fundirHistorico` is a union of server rows and
   * cached rows, so a conversation deleted only on the server is put back by
   * the cache on the very next load.
   */
  const confirmarExclusao = useCallback(async (id: string) => {
    try {
      const { data } = await supabase.auth.getSession();
      const uid = data.session?.user?.id ?? '';
      if (!uid) return;
      await excluir(uid, id);
      await removerConversa(uid, id).catch((err) => {
        console.warn('[history] remoção do cache ignorada:', err);
      });
    } catch (err) {
      console.warn('[history] exclusão falhou:', err);
    }
  }, []);

  /**
   * The load (mount + pull-to-refresh): Supabase first; when it fails the
   * cache fills the list and the honest pt-BR note shows ("mostrando o
   * último cache"). A successful read is also proof of connectivity and
   * keeps the cache fresh (write-through).
   */
  const carregar = useCallback(async () => {
    setAtualizando(true);
    try {
      let userId = '';
      try {
        const { data } = await supabase.auth.getSession();
        userId = data.session?.user?.id ?? '';
      } catch (err) {
        console.warn('[history] getSession falhou:', err);
      }
      if (userId === '') {
        // No readable session. Returning here used to leave `conversas` at
        // null forever, which renders the skeleton — a history screen that
        // loads and never finishes. The root gate owns the redirect to login;
        // this screen just has to stop pretending it is still working.
        setConversas([]);
        setDoCache(false);
        setFalhouCarga(true);
        return;
      }

      let servidor: Conversa[] = [];
      let chegouDoServidor = false;
      try {
        servidor = await lerHistorico(userId);
        chegouDoServidor = true;
      } catch (err) {
        console.warn('[history] lerHistorico falhou (offline?):', err);
      }

      let cache: Conversa[] = [];
      let chegouDoCache = false;
      try {
        cache = await carregarHistoricoOffline(userId);
        chegouDoCache = true;
      } catch (err) {
        // The offline cache is expo-sqlite, and on web that is a WASM build
        // that a strict CSP or a private window can refuse outright. It is a
        // fallback, not a requirement.
        console.warn('[history] cache offline indisponível:', err);
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
      // Only a load that got NOTHING from either side is a failure. A server
      // read that succeeded and returned zero rows is an empty history.
      setFalhouCarga(!chegouDoServidor && (!chegouDoCache || cache.length === 0));
    } finally {
      setAtualizando(false);
    }
  }, []);

  useEffect(() => {
    void carregar();
  }, [carregar]);

  /**
   * Delete with a 6s undo, exactly the old site's `apagarComDesfazer`: the
   * row leaves the list at once and the DB write only happens when the
   * window closes. Starting a second delete commits the first one, and so
   * does leaving the screen — the pending row must never survive as a
   * conversation the student already dismissed.
   */
  const apagarComDesfazer = useCallback(
    (conversa: Conversa) => {
      if (temporizador.current) {
        clearTimeout(temporizador.current);
        const anterior = pendente;
        if (anterior) void confirmarExclusao(anterior.id);
      }
      void haptics.press();
      setPendente(conversa);
      setConversas((atuais) => (atuais ?? []).filter((c) => c.id !== conversa.id));
      pendenteRef.current = conversa.id;
      temporizador.current = setTimeout(() => {
        temporizador.current = null;
        setPendente(null);
        pendenteRef.current = null;
        void confirmarExclusao(conversa.id);
      }, 6000);
    },
    [pendente, confirmarExclusao],
  );

  const desfazer = useCallback(() => {
    if (temporizador.current) clearTimeout(temporizador.current);
    temporizador.current = null;
    pendenteRef.current = null;
    const volta = pendente;
    setPendente(null);
    if (volta) setConversas((atuais) => [volta, ...(atuais ?? [])]);
  }, [pendente]);

  /**
   * Commit a still-pending delete when the screen goes away.
   *
   * The cleanup used to only clear the timer, which CANCELLED the delete
   * instead of committing it: leaving the history within the 6s undo window
   * meant the conversation was never deleted, and it was back on the next
   * visit. The student had already dismissed it; navigating away is not
   * "undo", the undo button is.
   */
  useEffect(
    () => () => {
      if (!temporizador.current) return;
      clearTimeout(temporizador.current);
      temporizador.current = null;
      const alvo = pendenteRef.current;
      pendenteRef.current = null;
      if (alvo) void confirmarExclusao(alvo);
    },
    // Deliberately empty: this cleanup must run on unmount only, and
    // `confirmarExclusao` has no changing dependency of its own.
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [],
  );

  const iniciarEdicao = useCallback((conversa: Conversa) => {
    setEditandoId(conversa.id);
    setNovoTitulo(rotuloDa(conversa));
  }, []);

  /**
   * Commit on blur or on submit, like the old site: a blank title is thrown
   * away rather than stored, because the row would then have no label.
   */
  const confirmarEdicao = useCallback(async () => {
    const alvo = editandoId;
    const titulo = novoTitulo.trim();
    setEditandoId(null);
    if (!alvo || titulo === '') return;
    setConversas((atuais) =>
      (atuais ?? []).map((c) => (c.id === alvo ? { ...c, titulo } : c)),
    );
    try {
      const { data } = await supabase.auth.getSession();
      const uid = data.session?.user?.id ?? '';
      if (!uid) return;
      await renomear(uid, alvo, titulo);
      await espelharNoCache(uid, alvo, (c) => ({ ...c, titulo }));
    } catch (err) {
      console.warn('[history] renomear falhou:', err);
      setAviso('Não foi possível renomear a conversa.');
    }
  }, [editandoId, novoTitulo, espelharNoCache]);

  /** Optimistic favourite toggle; the DB trigger caps it at 5. */
  const alternarFavorita = useCallback(async (conversa: Conversa) => {
    const alvo = !conversa.favorita;
    setConversas((atuais) =>
      (atuais ?? []).map((c) => (c.id === conversa.id ? { ...c, favorita: alvo } : c)),
    );
    try {
      const { data } = await supabase.auth.getSession();
      const uid = data.session?.user?.id ?? '';
      if (!uid) throw new Error('sem sessão');
      await favoritar(uid, conversa.id, alvo);
      await espelharNoCache(uid, conversa.id, (c) => ({ ...c, favorita: alvo }));
      void haptics.favorite();
    } catch (err) {
      // The trigger rejected it (5 favourites) or the write failed: put the
      // flag back where it was and say so.
      setConversas((atuais) =>
        (atuais ?? []).map((c) => (c.id === conversa.id ? { ...c, favorita: !alvo } : c)),
      );
      setAviso(err instanceof Error ? err.message : 'Não foi possível favoritar.');
      void haptics.error();
    }
  }, [espelharNoCache]);

  /** Search over the loaded window (local substring, case-insensitive). */
  const filtradas = useMemo(() => {
    if (conversas === null) return null;
    const termo = busca.trim().toLowerCase();
    if (termo === '') return conversas;
    return conversas.filter(
      (c) =>
        rotuloDa(c).toLowerCase().includes(termo) ||
        c.pergunta.toLowerCase().includes(termo) ||
        (c.resposta ?? '').toLowerCase().includes(termo),
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
          // Above the edge dissolve: the overlay is absolutely positioned and
          // would otherwise repaint the scene over the title and the search
          // field, which are chrome, not scrolling content.
          zIndex: 1,
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
        {aviso ? (
          <Text
            style={{
              color: colors.danger,
              fontFamily: fonts.body,
              fontSize: typography.xs.fontSize,
              textAlign: 'center',
            }}
            onPress={() => setAviso(null)}
          >
            {aviso}
          </Text>
        ) : null}
        {vazio && filtradas !== null && filtradas.length === 0 ? (
          falhouCarga && busca.trim() === '' ? (
            // The honest version of an empty list we could not fill: say the
            // load failed and offer the retry, instead of reporting that the
            // student has no conversations.
            <View style={{ alignItems: 'center', gap: spacing.sm }}>
              <Text
                style={{
                  color: colors.mutedForeground,
                  fontFamily: fonts.body,
                  fontSize: typography.sm.fontSize,
                  textAlign: 'center',
                }}
              >
                Não consegui carregar seu histórico.
              </Text>
              <Pressable
                onPress={() => void carregar()}
                disabled={atualizando}
                accessibilityLabel="Tentar de novo"
                style={({ pressed }) => ({
                  backgroundColor: colors.brand,
                  borderRadius: radius.full,
                  opacity: atualizando ? 0.6 : pressed ? 0.85 : 1,
                  paddingHorizontal: spacing.md,
                  paddingVertical: 6,
                })}
              >
                <Text
                  style={{
                    color: colors.brandForeground,
                    fontFamily: fonts.bodyBold,
                    fontSize: typography.xs.fontSize,
                  }}
                >
                  Tentar de novo
                </Text>
              </Pressable>
            </View>
          ) : (
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
          )
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
          if (item.tipo === 'esqueleto') {
            // Deliberately textless: a placeholder that spells out real group
            // names claims the student has conversations they may not have.
            return (
              <Glass
                radius={radius.md}
                style={{
                  marginBottom: spacing.sm,
                  minHeight: 56,
                  justifyContent: 'center',
                  paddingHorizontal: 14,
                }}
              >
                <View
                  style={{
                    backgroundColor: colors.mutedForeground,
                    borderRadius: radius.sm,
                    height: 10,
                    opacity: 0.18,
                    width: item.largura,
                  }}
                />
              </Glass>
            );
          }
          const c = item.conversa;
          return (
            <Glass
              onPress={
                editandoId === c.id
                  ? undefined
                  : () => router.push(`/(main)/chat/${c.id}`)
              }
              radius={radius.md}
              style={{
                marginBottom: spacing.sm,
                minHeight: 60,
                paddingVertical: 12,
                paddingLeft: 14,
                paddingRight: 6,
              }}
            >
              <View style={{ flexDirection: 'row', alignItems: 'center', gap: spacing.sm }}>
                {c.favorita ? <StarIcon size={15} color={colors.brand} /> : null}
                {editandoId === c.id ? (
                  // Edited in place, as the old site does: commit on submit
                  // or on blur, discard on an empty value.
                  <TextInput
                    value={novoTitulo}
                    onChangeText={setNovoTitulo}
                    onBlur={() => void confirmarEdicao()}
                    onSubmitEditing={() => void confirmarEdicao()}
                    autoFocus
                    // Select the whole title on open, the way a rename field
                    // should: the caret would otherwise land at the end of a
                    // long question and scroll the start of it out of view,
                    // and typing would append instead of replace.
                    selectTextOnFocus
                    returnKeyType="done"
                    selectionColor={colors.brand}
                    style={{
                      flex: 1,
                      color: colors.foreground,
                      fontFamily: fonts.body,
                      fontSize: typography.sm.fontSize,
                      padding: 0,
                      outlineStyle: 'none',
                    } as object}
                  />
                ) : (
                  <Text
                    numberOfLines={2}
                    style={{
                      flex: 1,
                      color: colors.foreground,
                      fontFamily: fonts.body,
                      fontSize: typography.sm.fontSize,
                      lineHeight: typography.sm.lineHeight,
                    }}
                  >
                    {rotuloDa(c)}
                  </Text>
                )}
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
                <MenuConversa
                  favorita={c.favorita}
                  aoFavoritar={() => void alternarFavorita(c)}
                  aoRenomear={() => iniciarEdicao(c)}
                  aoApagar={() => apagarComDesfazer(c)}
                />
              </View>
            </Glass>
          );
        }}
      />

      {/* The edge dissolve (old `page-fade-b` / `page-fade-t`): the scene
          repainted over the list, solid under the floating chrome and at the
          bottom edge, so rows melt into the backdrop instead of being cut. */}
      <BackdropDesvanecido lado="topo" solido={insets.top + ALTURA_CHROME} />
      <BackdropDesvanecido lado="base" solido={insets.bottom} />

      {/* The 6s undo window (old `apagarComDesfazer`). Above the dissolve. */}
      {pendente ? (
        <View
          style={{
            position: 'absolute',
            left: 0,
            right: 0,
            bottom: insets.bottom + spacing.md,
            paddingHorizontal: layout.gutter(largura),
            zIndex: 2,
          }}
        >
          <Glass
            variante="raised"
            radius={radius.lg}
            style={{
              alignItems: 'center',
              alignSelf: 'center',
              flexDirection: 'row',
              gap: spacing.md,
              maxWidth: layout.containerMaxWidth,
              paddingHorizontal: spacing.md,
              paddingVertical: 10,
              width: '100%',
            }}
          >
            <Text
              numberOfLines={1}
              style={{
                color: colors.foreground,
                flex: 1,
                fontFamily: fonts.body,
                fontSize: typography.sm.fontSize,
              }}
            >
              Conversa apagada
            </Text>
            <Pressable
              onPress={desfazer}
              hitSlop={8}
              accessibilityRole="button"
              style={({ pressed }) => [{ opacity: pressed ? 0.7 : 1 }]}
            >
              <Text
                style={{
                  color: colors.brand,
                  fontFamily: fonts.bodyBold,
                  fontSize: typography.sm.fontSize,
                }}
              >
                Desfazer
              </Text>
            </Pressable>
          </Glass>
        </View>
      ) : null}
    </View>
  );
}
