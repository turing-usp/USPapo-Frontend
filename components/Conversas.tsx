/**
 * The conversations in the drawer: search, groups, favorite, rename and delete with a 6 s undo;
 * offline it shows the cached copy. The list reloads each time the drawer opens, and closing the
 * drawer commits a pending delete (an undo only lasts while the list is on screen).
 */
import { usePathname, useRouter } from 'expo-router';
import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { FlatList, Pressable, TextInput, View } from 'react-native';

import { Icone } from './icons';
import { BotaoAcoes, MenuConversa, type AcaoConversa, type Ancora } from './MenuConversa';
import { Botao, Texto } from './ui';
import { sessaoAtual } from '../lib/auth';
import { guardarConversa, guardarHistorico, historicoEmCache } from '../lib/cache';
import { favoritar, lerHistorico, renomear, rotuloDa, type Conversa } from '../lib/conversations';
import { haptics } from '../lib/device';
import { agendarExclusao, desfazerExclusao, efetivarExclusoes, exclusaoPendente } from '../lib/exclusoes';
import { useTheme } from '../theme';

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

export default function Conversas({ aberta, aoAbrir }: { aberta: boolean; aoAbrir: (destino: string) => void }) {
  const { colors, fonts, radius, spacing, typography } = useTheme();
  const router = useRouter();
  const caminho = usePathname();
  const [uid, setUid] = useState('');
  const [conversas, setConversas] = useState<Conversa[] | null>(null);
  const [offline, setOffline] = useState(false);
  const [busca, setBusca] = useState('');
  const [aviso, setAviso] = useState<string | null>(null);
  const [editando, setEditando] = useState<{ id: string; titulo: string } | null>(null);
  const [apagada, setApagada] = useState<Conversa | null>(null);
  const [acoes, setAcoes] = useState<{ c: Conversa; ancora: Ancora } | null>(null);

  const carregar = useCallback(async (userId: string | null) => {
    setUid(userId ?? '');
    if (!userId) return setConversas([]);
    try {
      const lista = await lerHistorico(userId);
      setConversas(lista.filter((c) => !exclusaoPendente(c.id)));
      setOffline(false);
      void guardarHistorico(userId, lista);
    } catch {
      setConversas((await historicoEmCache(userId)).filter((c) => !exclusaoPendente(c.id)));
      setOffline(true);
    }
  }, []);

  // Closing drops the undo, the open menu and any notice (during render, as derived state).
  const [abertaAntes, setAbertaAntes] = useState(aberta);
  if (aberta !== abertaAntes) {
    setAbertaAntes(aberta);
    if (!aberta) {
      setApagada(null);
      setAcoes(null);
      setAviso(null);
    }
  }
  useEffect(() => {
    if (aberta) void sessaoAtual().then(({ userId }) => carregar(userId));
    else void efetivarExclusoes();
  }, [aberta, carregar]);

  function apagar(c: Conversa) {
    void efetivarExclusoes(); // only the latest delete keeps an undo
    void haptics.press();
    setApagada(c);
    setConversas((atual) => (atual ?? []).filter((x) => x.id !== c.id));
    if (caminho === `/chat/${c.id}`) router.replace('/');
    agendarExclusao(uid, c.id, 6000, {
      aoEfetivar: () => setApagada((atual) => (atual?.id === c.id ? null : atual)),
      aoFalhar: () => {
        setApagada((atual) => (atual?.id === c.id ? null : atual));
        setConversas((atual) => [c, ...(atual ?? []).filter((x) => x.id !== c.id)]);
        setAviso('Não foi possível apagar a conversa.');
      },
    });
  }

  function desfazer() {
    const c = apagada;
    setApagada(null);
    if (c && desfazerExclusao(c.id)) setConversas((atual) => [c, ...(atual ?? [])]);
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

  function escolher(acao: AcaoConversa) {
    const c = acoes?.c;
    setAcoes(null);
    if (!c) return;
    if (acao === 'favoritar') void atualizar(c, { favorita: !c.favorita }, () => favoritar(uid, c.id, !c.favorita));
    else if (acao === 'renomear') setEditando({ id: c.id, titulo: rotuloDa(c) });
    else apagar(c);
  }
  const fecharAcoes = useCallback(() => setAcoes(null), []);
  const menuAberto = useMemo(() => acoes && { favorita: acoes.c.favorita, ancora: acoes.ancora }, [acoes]);

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

  const texto = { color: colors.foreground, fontFamily: fonts.body, fontSize: typography.sm.fontSize, padding: 0, position: 'relative', outlineStyle: 'none' } as object;

  // A fragment: the menu must be a child of the drawer's panel, which sits at the window's origin
  // when open (the menu is placed in window coordinates).
  return (
    <>
    <View style={{ flex: 1, gap: spacing.sm }}>
      <View style={{ flexDirection: 'row', alignItems: 'center', gap: spacing.sm, height: 40, paddingHorizontal: spacing.md,
        borderRadius: radius.md, backgroundColor: colors.tint + '0f' }}>
        <Icone nome="busca" cor={colors.mutedForeground} tamanho={16} />
        <TextInput value={busca} onChangeText={setBusca} placeholder="Buscar nas conversas" placeholderTextColor={colors.faintForeground}
          selectionColor={colors.brand} autoCapitalize="none" autoCorrect={false} accessibilityLabel="Buscar nas conversas" style={[{ flex: 1 }, texto]} />
      </View>
      {offline ? <Texto v="legenda">Sem conexão — mostrando a última cópia salva neste aparelho.</Texto> : null}
      {aviso ? <Texto v="erro" onPress={() => setAviso(null)}>{aviso}</Texto> : null}
      <FlatList
        data={itens}
        keyExtractor={(i) => i.id}
        keyboardShouldPersistTaps="handled"
        style={{ flex: 1, marginHorizontal: -spacing.xs }}
        contentContainerStyle={{ paddingHorizontal: spacing.xs, paddingBottom: spacing.md }}
        ListEmptyComponent={conversas === null ? null : (
          <Texto v="suave" style={{ paddingVertical: spacing.lg, textAlign: 'center' }}>
            {busca ? 'Nenhuma conversa encontrada.' : offline ? 'Não consegui carregar suas conversas.' : 'Suas conversas aparecem aqui.'}
          </Texto>
        )}
        renderItem={({ item }) => item.tipo === 'grupo' ? (
          <Texto v="secao" style={{ fontSize: 11, marginTop: spacing.md, marginBottom: spacing.xs, paddingHorizontal: spacing.sm }}>{item.id}</Texto>
        ) : (
          <View style={{ flexDirection: 'row', alignItems: 'center', borderRadius: radius.md,
            backgroundColor: caminho === `/chat/${item.id}` ? colors.brand + '1f' : 'transparent' }}>
            <Pressable accessibilityRole="link" accessibilityLabel={rotuloDa(item.c)} disabled={editando?.id === item.id}
              onPress={() => aoAbrir(`/chat/${item.id}`)}
              style={({ pressed }) => ({ flex: 1, flexDirection: 'row', alignItems: 'center', gap: spacing.sm, minHeight: 40,
                paddingVertical: spacing.sm, paddingLeft: spacing.sm, borderRadius: radius.md, backgroundColor: pressed ? colors.tint + '14' : 'transparent' })}>
              {item.c.favorita ? <Icone nome="estrela" cor={colors.brand} tamanho={14} /> : null}
              {editando?.id === item.id ? (
                <TextInput value={editando.titulo} onChangeText={(t) => setEditando({ id: item.id, titulo: t })} autoFocus selectTextOnFocus
                  onBlur={() => void confirmarNome()} onSubmitEditing={() => void confirmarNome()} returnKeyType="done" maxLength={120}
                  style={[{ flex: 1 }, texto]} />
              ) : (
                <Texto v="suave" cor={colors.foreground} numberOfLines={1} style={{ flex: 1 }}>{rotuloDa(item.c)}</Texto>
              )}
              {item.c.resposta === null ? <Texto v="legenda" cor={colors.danger} style={{ fontFamily: fonts.bodyBold }}>PENDENTE</Texto> : null}
            </Pressable>
            <BotaoAcoes aoAbrir={(ancora) => setAcoes({ c: item.c, ancora })} />
          </View>
        )}
      />
      {apagada ? (
        <View style={{ flexDirection: 'row', alignItems: 'center', gap: spacing.sm, paddingLeft: spacing.md, paddingRight: spacing.xs,
          paddingVertical: spacing.xs, borderRadius: radius.md, backgroundColor: colors.tint + '14' }}>
          <Texto v="suave" cor={colors.foreground} style={{ flex: 1 }}>Conversa apagada</Texto>
          <Botao compacto v="secundario" rotulo="Desfazer" onPress={desfazer} />
        </View>
      ) : null}
    </View>
    <MenuConversa aberto={menuAberto} aoFechar={fecharAcoes} aoEscolher={escolher} />
    </>
  );
}
