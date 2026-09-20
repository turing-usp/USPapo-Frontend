/**
 * App chrome — port of the old site's AppShell header (site/app/components).
 *
 * The old site has no bottom tab bar: every screen sits under a floating
 * glass hamburger on the left and the account avatar on the right, and the
 * hamburger opens a glass panel that slides in from the left over a scrim.
 * This component is that chrome, and it is the only navigation surface, so
 * the route group renders it once around a plain Stack.
 *
 * Icon paths are the old site's Heroicons outline set, verbatim.
 */
import { useRouter } from 'expo-router';
import React, { useCallback, useEffect, useState } from 'react';
import {
  Animated,
  Easing,
  Modal,
  Pressable,
  StyleSheet,
  Text,
  View,
  useWindowDimensions,
} from 'react-native';
import { Path, Svg } from 'react-native-svg';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { LogoMark } from './BrandMarks';
import { haptics } from '../lib/haptics';
import { supabase } from '../lib/supabase';
import { useTheme } from '../theme';

/** Drawer width — the old `w-64 md:w-72`. */
const LARGURA_ESTREITA = 256;
const LARGURA_LARGA = 288;
/** The old `transition-transform duration-300 ease-in-out`. */
const DURACAO = 300;

type IconeProps = { size?: number; color: string };

/** 24x24 stroked icon, same line style as the old site's inline SVGs. */
function Icone({ size = 24, color, d }: IconeProps & { d: string | string[] }) {
  return (
    <Svg width={size} height={size} viewBox="0 0 24 24">
      {(Array.isArray(d) ? d : [d]).map((path) => (
        <Path
          key={path}
          d={path}
          fill="none"
          stroke={color}
          strokeWidth={2}
          strokeLinecap="round"
          strokeLinejoin="round"
        />
      ))}
    </Svg>
  );
}

const ICONE_MENU = 'M3.75 6.75h16.5M3.75 12h16.5m-16.5 5.25h16.5';
const ICONE_FECHAR = 'M6 18 18 6M6 6l12 12';
const ICONE_NOVO = 'M12 9v6m3-3H9m12 0a9 9 0 1 1-18 0 9 9 0 0 1 18 0Z';
const ICONE_BUSCA =
  'm21 21-5.197-5.197m0 0A7.5 7.5 0 1 0 5.196 5.196a7.5 7.5 0 0 0 10.602 10.602Z';
const ICONE_AJUSTES = [
  'M9.594 3.94c.09-.542.56-.94 1.11-.94h2.593c.55 0 1.02.398 1.11.94l.213 1.281c.063.374.313.686.645.87.074.04.147.083.22.127.324.196.72.257 1.075.124l1.217-.456a1.125 1.125 0 0 1 1.37.49l1.296 2.247a1.125 1.125 0 0 1-.26 1.43l-1.003.77a1.119 1.119 0 0 0-.362 1.18c.004.074.006.147.006.222a1.14 1.14 0 0 0 .006.222 1.119 1.119 0 0 0 .362 1.18l1.003.77a1.125 1.125 0 0 1 .26 1.43l-1.296 2.247a1.125 1.125 0 0 1-1.37.49l-1.216-.456a1.125 1.125 0 0 0-1.076.124 6.57 6.57 0 0 1-.22.128c-.331.183-.581.495-.644.869l-.213 1.28c-.09.543-.56.941-1.11.941h-2.594c-.55 0-1.02-.398-1.11-.94l-.213-1.281a1.125 1.125 0 0 0-.645-.87 6.528 6.528 0 0 1-.22-.127 1.125 1.125 0 0 0-1.075-.124l-1.217.456a1.125 1.125 0 0 1-1.37-.49l-1.296-2.247a1.125 1.125 0 0 1 .26-1.43l1.003-.77a1.119 1.119 0 0 0 .362-1.18 6.6 6.6 0 0 1-.006-.222c0-.074-.002-.148-.006-.222a1.119 1.119 0 0 0-.362-1.18l-1.003-.77a1.125 1.125 0 0 1-.26-1.43l1.296-2.247a1.125 1.125 0 0 1 1.37-.49l1.216.456c.356.133.751.072 1.076-.124.072-.044.146-.087.22-.128.332-.183.582-.495.644-.869l.213-1.28Z',
  'M15 12a3 3 0 1 1-6 0 3 3 0 0 1 6 0Z',
];

type ItemNav = { rotulo: string; icone: string | string[]; destino: string };

/** The old drawer's three entries, in order. */
const ITENS: ItemNav[] = [
  { rotulo: 'Novo Chat', icone: ICONE_NOVO, destino: '/(main)' },
  { rotulo: 'Pesquisar histórico', icone: ICONE_BUSCA, destino: '/(main)/history' },
  { rotulo: 'Configurações', icone: ICONE_AJUSTES, destino: '/(main)/settings' },
];

/**
 * One drawer row: brand-orange icon, Geom label, and the old hover wash
 * (`hover:bg-brand/15` with a `hover:border-brand/30` ring) reused as the
 * pressed state, which is what a touch surface actually has.
 */
function LinhaNav({
  item,
  aoTocar,
}: {
  item: ItemNav;
  aoTocar: (destino: string) => void;
}) {
  const { colors, fonts, radius, spacing, typography } = useTheme();
  return (
    <Pressable
      accessibilityRole="link"
      onPress={() => {
        void haptics.selection();
        aoTocar(item.destino);
      }}
      style={({ pressed }) => [
        styles.linhaNav,
        {
          borderRadius: radius.md,
          gap: spacing.md,
          paddingHorizontal: 14,
          paddingVertical: spacing.md,
          backgroundColor: pressed ? 'rgba(241,134,61,0.15)' : 'transparent',
          borderColor: pressed ? 'rgba(241,134,61,0.30)' : 'transparent',
        },
      ]}
    >
      <Icone size={20} color={colors.brand} d={item.icone} />
      <Text
        style={{
          color: colors.mutedForeground,
          fontFamily: fonts.display,
          fontSize: typography.sm.fontSize,
        }}
      >
        {item.rotulo}
      </Text>
    </Pressable>
  );
}

/** The sliding panel plus its scrim, mounted only while open. */
function Gaveta({
  aberta,
  aoFechar,
}: {
  aberta: boolean;
  aoFechar: () => void;
}) {
  const { scheme, colors, fonts, glass, spacing, typography } = useTheme();
  const router = useRouter();
  const { width } = useWindowDimensions();
  const insets = useSafeAreaInsets();
  const largura = width >= 768 ? LARGURA_LARGA : LARGURA_ESTREITA;

  const [deslocamento] = useState(() => new Animated.Value(0));

  useEffect(() => {
    Animated.timing(deslocamento, {
      toValue: aberta ? 1 : 0,
      duration: DURACAO,
      easing: Easing.inOut(Easing.ease),
      useNativeDriver: true,
    }).start();
  }, [aberta, deslocamento]);

  const navegar = useCallback(
    (destino: string) => {
      aoFechar();
      router.push(destino as never);
    },
    [aoFechar, router],
  );

  const x = deslocamento.interpolate({
    inputRange: [0, 1],
    outputRange: [-largura, 0],
  });

  return (
    <Modal
      visible={aberta}
      transparent
      animationType="none"
      onRequestClose={aoFechar}
    >
      {/* Scrim — the old `bg-scrim/10 dark:bg-scrim/25`. */}
      <Pressable
        accessibilityLabel="Fechar menu lateral"
        onPress={aoFechar}
        style={[
          StyleSheet.absoluteFill,
          {
            backgroundColor:
              scheme === 'dark' ? 'rgba(0,0,0,0.25)' : 'rgba(11,16,48,0.10)',
          },
        ]}
      />
      <Animated.View
        style={[
          styles.gaveta,
          glass.panel,
          {
            width: largura,
            paddingTop: insets.top + spacing.lg,
            paddingBottom: insets.bottom + spacing.lg,
            paddingHorizontal: spacing.lg,
            borderRightColor: glass.hairline.borderRightColor,
            transform: [{ translateX: x }],
          },
        ]}
      >
        {/* Header: logo + wordmark, with the close button opposite. */}
        <View
          style={[
            styles.cabecalhoGaveta,
            {
              borderBottomColor: colors.line + '1a',
              paddingBottom: spacing.lg,
            },
          ]}
        >
          <View style={[styles.marca, { gap: 10 }]}>
            <LogoMark size={32} />
            <Text
              style={{
                color: colors.brand,
                fontFamily: fonts.displayBold,
                fontSize: typography.xl.fontSize,
              }}
            >
              USPapo
            </Text>
          </View>
          <Pressable
            accessibilityLabel="Fechar menu lateral"
            onPress={aoFechar}
            hitSlop={8}
            style={{ padding: 6 }}
          >
            <Icone size={24} color={colors.mutedForeground} d={ICONE_FECHAR} />
          </Pressable>
        </View>

        <View style={{ gap: spacing.sm, marginTop: spacing.lg }}>
          {ITENS.map((item) => (
            <LinhaNav key={item.rotulo} item={item} aoTocar={navegar} />
          ))}
        </View>
      </Animated.View>
    </Modal>
  );
}

/**
 * First letter of the signed-in account, for the avatar. Falls back to "U"
 * while the session is still loading or when there is no email on it.
 */
function useInicialDaConta(): string {
  const [inicial, setInicial] = useState('U');
  useEffect(() => {
    let ativo = true;
    void supabase.auth.getUser().then(({ data }) => {
      const email = data.user?.email;
      if (ativo && email) setInicial(email.slice(0, 1).toUpperCase());
    });
    return () => {
      ativo = false;
    };
  }, []);
  return inicial;
}

/**
 * The floating header: hamburger on the left, avatar on the right. Both
 * float over the scrolling content exactly as they do on the old site, so
 * this renders as an absolutely positioned overlay, not a layout row.
 */
export default function Chrome() {
  const { colors, fonts, glass, radius, spacing, typography } = useTheme();
  const [aberta, setAberta] = useState(false);
  const insets = useSafeAreaInsets();
  const router = useRouter();
  const letra = useInicialDaConta();

  return (
    <>
      <View
        pointerEvents="box-none"
        style={[
          styles.barra,
          { paddingTop: insets.top + spacing.md, paddingHorizontal: spacing.lg },
        ]}
      >
        <Pressable
          accessibilityLabel="Abrir menu lateral"
          onPress={() => {
            void haptics.selection();
            setAberta(true);
          }}
          style={[
            styles.botaoMenu,
            glass.surface,
            glass.hairline,
            glass.shadow,
            { borderRadius: radius.md, padding: 10 },
          ]}
        >
          <Icone size={24} color={colors.mutedForeground} d={ICONE_MENU} />
        </Pressable>

        <Pressable
          accessibilityLabel="Menu do usuário"
          onPress={() => {
            void haptics.selection();
            router.push('/(main)/settings' as never);
          }}
          style={[
            styles.avatar,
            { backgroundColor: colors.brand, borderRadius: radius.full },
          ]}
        >
          <Text
            style={{
              color: colors.brandForeground,
              fontFamily: fonts.bodyBold,
              fontSize: typography.sm.fontSize,
            }}
          >
            {letra}
          </Text>
        </Pressable>
      </View>

      <Gaveta
        aberta={aberta}
        aoFechar={() => {
          void haptics.selection();
          setAberta(false);
        }}
      />
    </>
  );
}

/**
 * Height the chrome occupies below the safe-area inset (the bar's 12pt top
 * padding plus the 44pt hit targets), so screens can pad content under it.
 */
export const ALTURA_CHROME = 12 + 44;

const styles = StyleSheet.create({
  barra: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    zIndex: 30,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  botaoMenu: { alignItems: 'center', justifyContent: 'center' },
  avatar: {
    width: 36,
    height: 36,
    alignItems: 'center',
    justifyContent: 'center',
  },
  gaveta: {
    position: 'absolute',
    top: 0,
    bottom: 0,
    left: 0,
    borderRightWidth: 1,
  },
  cabecalhoGaveta: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    borderBottomWidth: 1,
  },
  marca: { flexDirection: 'row', alignItems: 'center' },
  linhaNav: {
    flexDirection: 'row',
    alignItems: 'center',
    borderWidth: 1,
  },
});
