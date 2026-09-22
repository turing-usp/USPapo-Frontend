/** History: grouped conversations with search, favorite, rename and delete (6 s undo); offline shows the cache. */
import { useRouter } from 'expo-router';
import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { FlatList, Pressable, RefreshControl, TextInput, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { ALTURA_CHROME } from '../../components/Chrome';
import Glass from '../../components/Glass';
import { Icone } from '../../components/icons';
import { MenuConversa } from '../../components/MenuConversa';
import { Botao, Campo, Coluna, Estado, Texto } from '../../components/ui';
import { sessaoAtual } from '../../lib/auth';
import { esquecerConversa, guardarConversa, guardarHistorico, historicoEmCache } from '../../lib/cache';
import { excluir, favoritar, lerHistorico, renomear, rotuloDa, type Conversa } from '../../lib/conversations';
import { haptics } from '../../lib/device';
import { useTheme } from '../../theme';

const GRUPOS = ['Favoritas', 'Hoje', 'Ontem', 'Últimos 7 dias', 'Últimos 30 dias', 'Anteriores'] as const;
const DIA = 86_400_000;

function grupoDa(c: Conversa, hoje: number): (typeof GRUPOS)[number] {
  if (c.favorita) return 'Favoritas';
  const quando = new Date(c.atualizada_em).getTime();
  if (Number.isNaN(quando) || quando < hoje - 30 * DIA) return 'Anteriores';
  if (quando >= hoje) return 'Hoje';
  if (quando >= hoje - DIA) return 'Ontem';
  return quando >= hoje - 7 * DIA ? 'Últimos 7 dias' : 'Últimos 30 dias';
}

type Item = { tipo: 'grupo'; id: string } | { tipo: 'conversa'; id: string; c: Conversa };

export default function Historico() {
  const { colors, layout, radius, spacing, typography } = useTheme();
  const insets = useSafeAreaInsets();
  const router = useRouter();
  const [uid, setUid] = useState('');
  const [conversas, setConversas] = useState<Conversa[] | null>(null);
  const [offline, setOffline] = useState(false);
  const [atualizando, setAtualizando] = useState(true);
  const [busca, setBusca] = useState('');
  const [aviso, setAviso] = useState<string | null>(null);
  const [editando, setEditando] = useState<{ id: string; titulo: string } | null>(null);
  const [apagada, setApagada] = useState<Conversa | null>(null);
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const apagadaRef = useRef<Conversa | null>(null);

  const carregar = useCallback(async (userId: string) => {
    setUid(userId);
    if (!userId) {
      setAtualizando(false);
      return setConversas([]);
    }
    try {
      const lista = await lerHistorico(userId);
      setConversas(lista);
      setOffline(false);
      void guardarHistorico(userId, lista);
    } catch {
      setConversas(await historicoEmCache(userId));
      setOffline(true);
    } finally {
      setAtualizando(false);
    }
  }, []);
  const recarregar = useCallback(() => void sessaoAtual().then(({ userId }) => carregar(userId)), [carregar]);
  useEffect(recarregar, [recarregar]);

  const confirmarExclusao = useCallback(async (c: Conversa) => {
    try {
      await excluir(uid, c.id);
      await esquecerConversa(uid, c.id);
    } catch {
      setConversas((atual) => [c, ...(atual ?? [])]);
      setAviso('Não foi possível apagar a conversa.');
    }
  }, [uid]);

  // Leaving the screen inside the undo window commits the delete (it is not an undo).
  useEffect(() => () => {
    if (timer.current) clearTimeout(timer.current);
    if (apagadaRef.current) void confirmarExclusao(apagadaRef.current);
  }, [confirmarExclusao]);

  function apagar(c: Conversa) {
    if (timer.current) clearTimeout(timer.current);
    if (apagadaRef.current) void confirmarExclusao(apagadaRef.current);
    void haptics.press();
    apagadaRef.current = c;
    setApagada(c);
    setConversas((atual) => (atual ?? []).filter((x) => x.id !== c.id));
    timer.current = setTimeout(() => {
      apagadaRef.current = null;
      setApagada(null);
      void confirmarExclusao(c);
    }, 6000);
  }

  function desfazer() {
    if (timer.current) clearTimeout(timer.current);
    const c = apagadaRef.current;
    apagadaRef.current = null;
    setApagada(null);
    if (c) setConversas((atual) => [c, ...(atual ?? [])]);
  }

  async function atualizar(c: Conversa, mudanca: Partial<Conversa>, salvar: () => Promise<void>) {
    setConversas((atual) => (atual ?? []).map((x) => (x.id === c.id ? { ...x, ...mudanca } : x)));
    try {
      await salvar();
      void guardarConversa(uid, { ...c, ...mudanca });
    } catch (err) {
      setConversas((atual) => (atual ?? []).map((x) => (x.id === c.id ? c : x)));
      setAviso(err instanceof Error ? err.message : 'Não foi possível salvar.');
      void haptics.error();
    }
  }

  async function confirmarNome() {
    const alvo = editando;
    setEditando(null);
    const c = conversas?.find((x) => x.id === alvo?.id);
    if (alvo && c && alvo.titulo.trim() && alvo.titulo.trim() !== rotuloDa(c)) {
      await atualizar(c, { titulo: alvo.titulo.trim() }, () => renomear(uid, c.id, alvo.titulo));
    }
  }

  const itens = useMemo<Item[]>(() => {
    const termo = busca.trim().toLowerCase();
    const hoje = new Date().setHours(0, 0, 0, 0);
    const filtradas = (conversas ?? []).filter((c) => !termo || [rotuloDa(c), ...c.mensagens.flatMap((m) => [m.pergunta, m.resposta ?? ''])]
      .some((t) => t.toLowerCase().includes(termo)));
    return GRUPOS.flatMap((g) => {
      const doGrupo = filtradas.filter((c) => grupoDa(c, hoje) === g);
      return doGrupo.length ? [{ tipo: 'grupo' as const, id: g }, ...doGrupo.map((c) => ({ tipo: 'conversa' as const, id: c.id, c }))] : [];
    });
  }, [conversas, busca]);

  return (
    <View style={{ flex: 1 }}>
      <FlatList
        data={itens}
        keyExtractor={(i) => i.id}
        keyboardShouldPersistTaps="handled"
        refreshControl={<RefreshControl refreshing={atualizando} onRefresh={() => { setAtualizando(true); recarregar(); }} tintColor={colors.brand} />}
        contentContainerStyle={{ alignSelf: 'center', width: '100%', maxWidth: layout.containerMaxWidth, gap: spacing.sm,
          paddingHorizontal: spacing.lg, paddingTop: insets.top + ALTURA_CHROME + spacing.md, paddingBottom: insets.bottom + 96 }}
        ListHeaderComponent={
          <View style={{ gap: spacing.md, marginBottom: spacing.sm }}>
            <Texto v="titulo">Histórico</Texto>
            <Campo icone="busca" value={busca} onChangeText={setBusca} placeholder="Buscar nas conversas" autoCapitalize="none" autoCorrect={false} />
            {offline ? <Texto v="legenda" centro>Sem conexão — mostrando a última cópia salva neste aparelho.</Texto> : null}
            {aviso ? <Texto v="erro" centro onPress={() => setAviso(null)}>{aviso}</Texto> : null}
          </View>
        }
        ListEmptyComponent={
          conversas === null ? null : offline
            ? <Estado mensagem="Não consegui carregar seu histórico." acao="Tentar de novo" aoAgir={() => { setAtualizando(true); recarregar(); }} />
            : <Estado mensagem={busca ? 'Nenhuma conversa encontrada.' : 'Suas conversas aparecem aqui.'} />
        }
        renderItem={({ item }) => item.tipo === 'grupo' ? (
          <Texto v="secao" style={{ marginTop: spacing.md }}>{item.id}</Texto>
        ) : (
          <Glass radius={radius.md} style={{ flexDirection: 'row', alignItems: 'center', gap: spacing.sm, minHeight: 60, paddingRight: 6 }}>
            <Pressable accessibilityRole="link" accessibilityLabel={rotuloDa(item.c)} disabled={editando?.id === item.id}
              onPress={() => router.push(`/chat/${item.id}`)}
              style={({ pressed }) => ({ flex: 1, flexDirection: 'row', alignItems: 'center', gap: spacing.sm, alignSelf: 'stretch',
                paddingVertical: spacing.sm, paddingLeft: 14, opacity: pressed ? 0.7 : 1 })}>
            {item.c.favorita ? <Icone nome="estrela" cor={colors.brand} tamanho={15} /> : null}
            {editando?.id === item.id ? (
              <TextInput value={editando.titulo} onChangeText={(t) => setEditando({ id: item.id, titulo: t })} autoFocus selectTextOnFocus
                onBlur={() => void confirmarNome()} onSubmitEditing={() => void confirmarNome()} returnKeyType="done" maxLength={120}
                style={{ flex: 1, color: colors.foreground, fontFamily: 'Roboto', fontSize: typography.sm.fontSize, padding: 0, position: 'relative', outlineStyle: 'none' } as object} />
            ) : (
              <Texto v="suave" cor={colors.foreground} numberOfLines={2} style={{ flex: 1 }}>{rotuloDa(item.c)}</Texto>
            )}
            {item.c.resposta === null ? <Texto v="legenda" cor={colors.danger} style={{ fontFamily: 'Roboto-Bold' }}>PENDENTE</Texto> : null}
            </Pressable>
            <MenuConversa favorita={item.c.favorita}
              aoFavoritar={() => void atualizar(item.c, { favorita: !item.c.favorita }, () => favoritar(uid, item.c.id, !item.c.favorita))}
              aoRenomear={() => setEditando({ id: item.id, titulo: rotuloDa(item.c) })}
              aoApagar={() => apagar(item.c)} />
          </Glass>
        )}
      />
      {apagada ? (
        <Coluna style={{ position: 'absolute', bottom: insets.bottom + spacing.lg }}>
          <Glass desfoque variante="raised" radius={radius.lg} style={{ flexDirection: 'row', alignItems: 'center', gap: spacing.md, paddingLeft: spacing.lg, paddingRight: spacing.sm, paddingVertical: spacing.sm }}>
            <Texto v="suave" cor={colors.foreground} style={{ flex: 1 }}>Conversa apagada</Texto>
            <Botao compacto v="secundario" rotulo="Desfazer" onPress={desfazer} />
          </Glass>
        </Coluna>
      ) : null}
    </View>
  );
}
