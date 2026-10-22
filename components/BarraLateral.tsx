/** Sidebar presentation shared by web and native; Chrome owns the drawer and navigation. */
import React, { useEffect, useRef, useState, type ReactNode } from 'react';
import { BackHandler, Image, Platform, Pressable, StyleSheet, View } from 'react-native';
import Reanimated, { Easing, useAnimatedStyle, useSharedValue, withTiming } from 'react-native-reanimated';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import Glass from './Glass';
import { Icone, type NomeIcone } from './icons';
import { Pressionavel, useSurgimento } from './Movimento';
import { BotaoDeIcone, ItemDeMenu, Marca, Texto, tintaDoToque } from './ui';
import { alfa, useTheme } from '../theme';

export type PerfilDaBarra = { nome: string; email: string; foto: string | null; admin: boolean };
type Destino = '/' | '/settings' | '/analytics';

/** The old site's 90° / 500 ms gear turn and 1.1× new-chat icon, now on Reanimated. */
function BotaoDaBarra({ icone, rotulo, aoTocar, compacto = false, destaque = false }: {
  icone: NomeIcone; rotulo: string; aoTocar: () => void; compacto?: boolean; destaque?: boolean;
}) {
  const { colors, fonts, radius, spacing, typography } = useTheme();
  const interacao = useRef({ mouse: false, foco: false, toque: false });
  const progresso = useSharedValue(0);
  const interagir = (origem: keyof typeof interacao.current, ativo: boolean) => {
    interacao.current[origem] = ativo;
    progresso.set(withTiming(Object.values(interacao.current).some(Boolean) ? 1 : 0, {
      duration: icone === 'ajustes' ? 500 : 180, easing: Easing.inOut(Easing.quad),
    }));
  };
  const movimento = useAnimatedStyle(() => ({ transform: [
    { rotate: `${icone === 'ajustes' ? progresso.value * 90 : 0}deg` },
    { scale: icone === 'novo' ? 1 + progresso.value * 0.1 : 1 },
  ] }), [icone]);
  return (
    <Pressable accessibilityRole="link" accessibilityLabel={rotulo} onPress={aoTocar}
      onHoverIn={() => interagir('mouse', true)} onHoverOut={() => interagir('mouse', false)}
      onFocus={() => interagir('foco', true)} onBlur={() => interagir('foco', false)}
      onPressIn={() => interagir('toque', true)} onPressOut={() => interagir('toque', false)}
      style={(estado) => [styles.linha, { minHeight: 44, borderRadius: radius.md,
        width: compacto ? 44 : undefined, justifyContent: compacto ? 'center' : 'flex-start',
        gap: compacto ? 0 : spacing.md, paddingHorizontal: compacto ? 0 : spacing.md,
        backgroundColor: estado.pressed || ('hovered' in estado && estado.hovered)
          ? tintaDoToque(estado, colors.foreground) : destaque ? alfa(colors.foreground, 0.06) : 'transparent' }]}>
      <Reanimated.View style={movimento}><Icone nome={icone} cor={colors.brand} /></Reanimated.View>
      {compacto ? null : <Texto cor={colors.foreground} style={{ fontFamily: fonts.title, ...typography.base }}>{rotulo}</Texto>}
    </Pressable>
  );
}

export default function BarraLateral({ conta, aberta, pesquisaAberta, aoAlternarPesquisa, aoMinimizar, aoNavegar, aoSair, children }: {
  conta: PerfilDaBarra; aberta: boolean; pesquisaAberta: boolean; aoAlternarPesquisa: () => void;
  aoMinimizar: () => void; aoNavegar: (destino: Destino) => void; aoSair: () => void; children: ReactNode;
}) {
  const { colors, fonts, radius, spacing, typography } = useTheme();
  const insets = useSafeAreaInsets();
  const [perfilAberto, setPerfilAberto] = useState(false);
  if (!aberta && perfilAberto) setPerfilAberto(false);
  const perfilVisivel = perfilAberto && aberta;
  const menu = useSurgimento(perfilVisivel, { de: 0.94 });
  useEffect(() => {
    if (!perfilVisivel) return;
    const fechar = () => setPerfilAberto(false);
    if (Platform.OS === 'web') {
      const tecla = (e: KeyboardEvent) => { if (e.key === 'Escape') { e.stopPropagation(); fechar(); } };
      window.addEventListener('keydown', tecla);
      return () => window.removeEventListener('keydown', tecla);
    }
    const sub = BackHandler.addEventListener('hardwareBackPress', () => { fechar(); return true; });
    return () => sub.remove();
  }, [perfilVisivel]);
  return (
    <Glass opaco semSombra style={{ flex: 1, gap: spacing.md, paddingTop: insets.top + spacing.md,
      paddingBottom: insets.bottom + spacing.md, paddingHorizontal: spacing.md }}>
      <View style={[styles.linha, { justifyContent: 'space-between', minHeight: 44, paddingLeft: spacing.xs }]}>
        <Pressionavel accessibilityRole="link" accessibilityLabel="USPapo — novo chat" onPress={() => aoNavegar('/')} aperto={0.96}>
          <Marca logo={24} fonte={22} />
        </Pressionavel>
        <View style={[styles.linha, { gap: spacing.xs }]}>
          <BotaoDeIcone icone="busca" rotulo={pesquisaAberta ? 'Fechar pesquisa' : 'Pesquisar conversas'}
            ativo={pesquisaAberta} animar={false} onPress={aoAlternarPesquisa} tamanho={19} lado={36} />
          <BotaoDeIcone icone="painel" rotulo="Minimizar barra lateral" onPress={aoMinimizar} tamanho={21} lado={36} />
        </View>
      </View>
      <View style={{ gap: spacing.xs }}>
        <BotaoDaBarra icone="novo" rotulo="Novo chat" aoTocar={() => aoNavegar('/')} destaque />
        {conta.admin && Platform.OS === 'web'
          ? <BotaoDaBarra icone="grafico" rotulo="Painel de métricas" aoTocar={() => aoNavegar('/analytics')} /> : null}
      </View>
      {/* History fills the remaining space; its anchored menu shares the panel's origin. */}
      {children}
      {perfilVisivel ? <Pressable accessibilityLabel="Fechar menu do perfil" onPress={() => setPerfilAberto(false)}
        style={[StyleSheet.absoluteFill, { zIndex: 2 }]} /> : null}
      <View style={{ zIndex: 3, borderTopWidth: 1, borderTopColor: alfa(colors.foreground, 0.1), paddingTop: spacing.sm }}>
        <View style={[styles.linha, { gap: spacing.xs }]}>
          <Pressionavel accessibilityRole="button" accessibilityLabel="Menu do perfil" aria-expanded={perfilVisivel}
            onPress={() => setPerfilAberto((v) => !v)} aperto={0.98}
            style={{ flex: 1, minWidth: 0, minHeight: 52, flexDirection: 'row', alignItems: 'center', gap: spacing.sm,
              paddingHorizontal: spacing.sm, borderRadius: radius.md }}>
            <View style={{ width: 36, height: 36, alignItems: 'center', justifyContent: 'center',
              backgroundColor: colors.brand, borderRadius: radius.full, overflow: 'hidden' }}>
              {conta.foto ? <Image source={{ uri: conta.foto }} style={StyleSheet.absoluteFill} />
                : <Texto cor={colors.brandForeground} style={{ fontFamily: fonts.title, ...typography.lg }}>{(conta.nome || 'U')[0].toUpperCase()}</Texto>}
            </View>
            <View style={{ flex: 1, minWidth: 0 }}>
              <Texto cor={colors.foreground} numberOfLines={1} style={{ fontFamily: fonts.title, ...typography.sm }}>{conta.nome || 'Minha conta'}</Texto>
              <Texto v="legenda" numberOfLines={1}>{conta.email || 'USPapo'}</Texto>
            </View>
          </Pressionavel>
          <BotaoDaBarra icone="ajustes" rotulo="Configurações" aoTocar={() => aoNavegar('/settings')} compacto />
        </View>
        {menu.montado ? (
          <Glass opaco radius={radius.lg} movimento={menu.movimento} origem="left bottom" pointerEvents={perfilVisivel ? 'auto' : 'none'}
            style={{ position: 'absolute', left: 0, right: 0, bottom: 64, padding: spacing.xs }}>
            <Reanimated.View style={menu.conteudo}>
              <View style={{ paddingHorizontal: spacing.md, paddingVertical: spacing.sm }}>
                <Texto cor={colors.foreground} numberOfLines={1}>{conta.nome || 'Minha conta'}</Texto>
                <Texto v="legenda" numberOfLines={1}>{conta.email}</Texto>
              </View>
              <View style={{ borderTopWidth: 1, borderTopColor: alfa(colors.foreground, 0.1), marginVertical: spacing.xs }} />
              <ItemDeMenu icone="sair" rotulo="Sair" onPress={() => { setPerfilAberto(false); aoSair(); }} />
            </Reanimated.View>
          </Glass>
        ) : null}
      </View>
    </Glass>
  );
}

const styles = StyleSheet.create({ linha: { flexDirection: 'row', alignItems: 'center' } });
