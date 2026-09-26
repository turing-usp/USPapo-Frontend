/**
 * Floating chrome (the only navigation surface): a glass menu button that opens
 * a sliding glass drawer, the account avatar with its menu (Sair), which a tap
 * anywhere else closes, and the announcements (aviso pill and giant glass).
 */
import { useRouter } from 'expo-router';
import React, { useEffect, useState } from 'react';
import { Animated, Easing, Image, Platform, Pressable, StyleSheet, View, useWindowDimensions } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { PilulaAviso, VidroGigante, useComunicados } from './Comunicados';
import Glass from './Glass';
import { Icone, LogoUSPapo, type NomeIcone } from './icons';
import { Texto } from './ui';
import { haptics } from '../lib/device';
import { esquecerAparelho } from '../lib/notificacoes';
import { supabase } from '../lib/supabase';
import { useTheme } from '../theme';

/** Height below the top inset the chrome occupies (12pt padding + 44pt targets). */
export const ALTURA_CHROME = 56;

type Conta = { nome: string; email: string; foto: string | null; admin: boolean };

function useConta(): Conta {
  const [conta, setConta] = useState<Conta>({ nome: '', email: '', foto: null, admin: false });
  useEffect(() => {
    let ativo = true;
    void (async () => {
      const { data } = await supabase.auth.getUser();
      const u = data.user;
      if (!u) return;
      const meta = (u.user_metadata ?? {}) as Record<string, string | undefined>;
      const { data: perfil } = await supabase.from('Perfis').select('nome, avatar_url, uspapo_role').eq('id', u.id).maybeSingle();
      if (!ativo) return;
      setConta({
        nome: perfil?.nome || meta.full_name || meta.name || (u.email ?? '').split('@')[0],
        email: u.email ?? '',
        foto: perfil?.avatar_url || meta.avatar_url || meta.picture || null,
        admin: perfil?.uspapo_role === 'admin',
      });
    })();
    return () => {
      ativo = false;
    };
  }, []);
  return conta;
}

function LinhaNav({ icone, rotulo, aoTocar }: { icone: NomeIcone; rotulo: string; aoTocar: () => void }) {
  const { colors, radius, spacing } = useTheme();
  return (
    <Pressable
      accessibilityRole="link"
      onPress={aoTocar}
      style={({ pressed }) => [styles.linha, { borderRadius: radius.md, gap: spacing.md, padding: spacing.md,
        backgroundColor: pressed ? 'rgba(241,134,61,0.15)' : 'transparent' }]}
    >
      <Icone nome={icone} cor={colors.brand} />
      <Texto v="suave" style={{ fontFamily: 'Geom' }}>{rotulo}</Texto>
    </Pressable>
  );
}

function Gaveta({ aberta, fechar, admin }: { aberta: boolean; fechar: () => void; admin: boolean }) {
  const { colors, spacing } = useTheme();
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const { width } = useWindowDimensions();
  const largura = width >= 768 ? 288 : 256;
  // Stays mounted (hidden by pointerEvents + position): unmounting mid-animation broke later opens.
  const [progresso] = useState(() => new Animated.Value(0));
  useEffect(() => {
    Animated.timing(progresso, {
      toValue: aberta ? 1 : 0, duration: 300, useNativeDriver: true,
      easing: aberta ? Easing.out(Easing.cubic) : Easing.in(Easing.cubic),
    }).start();
  }, [aberta, progresso]);

  const ir = (destino: string) => {
    fechar();
    router.push(destino as never);
  };
  const x = progresso.interpolate({ inputRange: [0, 1], outputRange: [-largura - 16, 0] });

  return (
    <View pointerEvents={aberta ? 'auto' : 'none'} style={[StyleSheet.absoluteFill, { zIndex: 40 }]}>
      <Animated.View style={[StyleSheet.absoluteFill, { opacity: progresso }]}>
        <Pressable accessibilityLabel="Fechar menu lateral" onPress={fechar} style={[StyleSheet.absoluteFill, { backgroundColor: colors.scrim + '40' }]} />
      </Animated.View>
      <Animated.View style={[styles.gaveta, { width: largura, transform: [{ translateX: x }] }]}>
        <Glass desfoque variante="panel" semSombra style={{ flex: 1, paddingTop: insets.top + spacing.lg, paddingBottom: insets.bottom + spacing.lg, paddingHorizontal: spacing.lg }}>
          <View style={[styles.cabecalho, { borderBottomColor: colors.line + '1a', paddingBottom: spacing.lg }]}>
            <View style={[styles.linha, { gap: 10 }]}>
              <LogoUSPapo size={32} />
              <Texto v="subtitulo" cor={colors.brand}>USPapo</Texto>
            </View>
            <Pressable accessibilityLabel="Fechar menu lateral" onPress={fechar} hitSlop={8}>
              <Icone nome="fechar" cor={colors.mutedForeground} tamanho={24} />
            </Pressable>
          </View>
          <View style={{ gap: spacing.xs, marginTop: spacing.lg }}>
            <LinhaNav icone="novo" rotulo="Novo chat" aoTocar={() => ir('/')} />
            <LinhaNav icone="busca" rotulo="Histórico" aoTocar={() => ir('/history')} />
            <LinhaNav icone="ajustes" rotulo="Configurações" aoTocar={() => ir('/settings')} />
            {admin && Platform.OS === 'web' ? <LinhaNav icone="grafico" rotulo="Painel de métricas" aoTocar={() => ir('/analytics')} /> : null}
          </View>
        </Glass>
      </Animated.View>
    </View>
  );
}

export default function Chrome() {
  const { colors, fonts, radius, spacing } = useTheme();
  const insets = useSafeAreaInsets();
  const router = useRouter();
  const conta = useConta();
  const [gaveta, setGaveta] = useState(false);
  const [menu, setMenu] = useState(false);
  const comunicados = useComunicados();

  async function sair() {
    setMenu(false);
    await esquecerAparelho().catch(() => undefined); // this device stops getting the account's pushes
    await supabase.auth.signOut().catch(() => undefined);
    router.replace('/login');
  }

  return (
    <>
      {/* Content scrolling under the clock and icons stays legible: frosted glass, or on Android a fade
          of the canvas (each Android blur redraws the whole screen every frame, and this one never stops). */}
      {insets.top ? (Platform.OS === 'android' ? (
        <View pointerEvents="none" style={[styles.status, { height: insets.top + spacing.md,
          experimental_backgroundImage: `linear-gradient(to bottom, ${colors.canvas}f0 60%, ${colors.canvas}00)` }]} />
      ) : <Glass desfoque semBorda semSombra pointerEvents="none" style={[styles.status, { height: insets.top }]} />) : null}
      {menu ? <Pressable accessibilityLabel="Fechar menu do usuário" onPress={() => setMenu(false)} style={[StyleSheet.absoluteFill, styles.fora]} /> : null}
      <View pointerEvents="box-none" style={[styles.barra, { paddingTop: insets.top + spacing.md, paddingHorizontal: spacing.lg }]}>
        <Glass desfoque radius={radius.md} onPress={() => { void haptics.selection(); setMenu(false); setGaveta(true); }}
          accessibilityLabel="Abrir menu lateral" style={styles.alvo}>
          <Icone nome="menu" cor={colors.mutedForeground} tamanho={24} traco={2} />
        </Glass>
        <View pointerEvents="box-none" style={[styles.meio, { paddingHorizontal: spacing.sm }]}>
          {comunicados.aviso ? <PilulaAviso aviso={comunicados.aviso} aoAbrir={() => comunicados.abrir(comunicados.aviso)} /> : null}
        </View>
        <View>
          <Pressable accessibilityLabel="Menu do usuário" onPress={() => setMenu((v) => !v)}
            style={[styles.avatar, { backgroundColor: colors.brand, borderRadius: radius.full }]}>
            {conta.foto ? <Image source={{ uri: conta.foto }} style={StyleSheet.absoluteFill} />
              : <Texto cor={colors.brandForeground} style={{ fontFamily: fonts.bodyBold }}>{(conta.nome || 'U')[0].toUpperCase()}</Texto>}
          </Pressable>
          {menu ? (
            <Glass desfoque variante="panel" radius={radius.lg} style={styles.menu}>
              <View style={{ paddingHorizontal: 12, paddingVertical: 8 }}>
                {conta.nome ? <Texto v="suave" cor={colors.foreground} numberOfLines={1}>{conta.nome}</Texto> : null}
                <Texto v="legenda" numberOfLines={1}>{conta.email}</Texto>
              </View>
              <View style={{ borderTopColor: colors.line + '1a', borderTopWidth: 1, marginVertical: 4 }} />
              <Pressable accessibilityRole="button" onPress={() => void sair()}
                style={({ pressed }) => ({ borderRadius: radius.md, paddingHorizontal: 12, paddingVertical: spacing.sm, backgroundColor: pressed ? colors.tint + '14' : 'transparent' })}>
                <Texto v="erro">Sair</Texto>
              </Pressable>
            </Glass>
          ) : null}
        </View>
      </View>
      <Gaveta aberta={gaveta} fechar={() => setGaveta(false)} admin={conta.admin} />
      <VidroGigante comunicado={comunicados.aberto} aoFechar={comunicados.fechar} aoOcultar={comunicados.ocultarAviso} />
    </>
  );
}

const styles = StyleSheet.create({
  status: { position: 'absolute', top: 0, left: 0, right: 0, zIndex: 30 },
  fora: { zIndex: 29 },
  barra: { position: 'absolute', top: 0, left: 0, right: 0, zIndex: 30, flexDirection: 'row', alignItems: 'flex-start', justifyContent: 'space-between' },
  alvo: { width: 44, height: 44, alignItems: 'center', justifyContent: 'center' },
  meio: { flex: 1, alignItems: 'center', marginTop: 2 },
  avatar: { width: 40, height: 40, alignItems: 'center', justifyContent: 'center', overflow: 'hidden', marginTop: 2 },
  menu: { position: 'absolute', right: 0, top: 48, width: 224, padding: 4 },
  gaveta: { position: 'absolute', top: 0, bottom: 0, left: 0 },
  cabecalho: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', borderBottomWidth: 1 },
  linha: { flexDirection: 'row', alignItems: 'center' },
});
