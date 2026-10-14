/**
 * A turn's progress line: the animated USPapo mark (lib/logo.ts) with a status beside it.
 *
 * - pensando: the pages go around their square and the status (the last tool's label, or
 *   "Pensando") breathes left to right in the logo's orange.
 * - escrevendo: the answer has started; the status fades into the mark and the mark collapses into
 *   the answer's cursor, then `aoConcluir` hands over to Resposta, whose cursor is in that same spot.
 * - erro / parado: the mark settles back into the logo (red / muted) and the status becomes the
 *   message, with "Tentar de novo" for errors.
 *
 * Each change starts from wherever the loop is and blends away from it while it keeps moving. The
 * mark is drawn on the UI thread, and a settled line renders no frames.
 */
import React, { useEffect, useEffectEvent, useState } from 'react';
import { Text, View, type TextStyle } from 'react-native';
import Animated, {
  Easing, interpolateColor, useAnimatedProps, useAnimatedStyle, useDerivedValue, useFrameCallback, useReducedMotion,
  useSharedValue, withTiming, type SharedValue,
} from 'react-native-reanimated';
import Svg, { Path } from 'react-native-svg';

import { CURSOR } from './Resposta';
import { COR_LOGO } from '../icons';
import { Botao } from '../ui';
import { CAIXA, TRACO, paginaDoCursor, tracados } from '../../lib/logo';
import { useTheme } from '../../theme';

export type EstadoAndamento = 'pensando' | 'escrevendo' | 'erro' | 'parado';

/** Height of the mark; the answer's cursor fits inside it, so the mark collapses in place. */
const ALTURA = 28;
const ESCALA = ALTURA / CAIXA.altura;
const LARGURA = Math.ceil(CAIXA.largura * ESCALA);
const ALVO = paginaDoCursor(ESCALA, CURSOR);
/** One step of the loop (a rest on a corner, then a move); a full turn is four. */
const PASSO_MS = 400;
/** The status breathes once per turn of the loop: a sweep over most of it, then a rest. */
const ONDA_MS = 4 * PASSO_MS;
const VARREDURA = 0.78;
const COLAPSO_MS = 380;
const REPOUSO_MS = 480;
const TROCA_MS = 110;
/** Width of each slice of the status overlay, and half the width of the breath across it. */
const FATIA = 8;
const BANDA = 36;

const Caminho = Animated.createAnimatedComponent(Path);

function Marca({ fase, repouso, colapso, tom, cor }: {
  fase: SharedValue<number>; repouso: SharedValue<number>; colapso: SharedValue<number>; tom: SharedValue<number>; cor: string;
}) {
  const quadro = useDerivedValue(() => tracados(fase.value, repouso.value, colapso.value, ALVO));
  // The stroke follows `color` (currentColor): react-native-svg's web shapes drop an animated `stroke` string.
  const verso = useAnimatedProps(() => ({ d: quadro.value.verso, color: interpolateColor(tom.value, [0, 1], [COR_LOGO, cor]) }), [cor]);
  const frente = useAnimatedProps(() => ({ d: quadro.value.frente, color: interpolateColor(tom.value, [0, 1], [COR_LOGO, cor]) }), [cor]);
  const [inicial] = useState(() => tracados(fase.get(), repouso.get(), colapso.get(), ALVO));
  return (
    <Svg width={LARGURA} height={ALTURA} viewBox={`${CAIXA.x} ${CAIXA.y} ${LARGURA / ESCALA} ${CAIXA.altura}`} aria-hidden>
      <Caminho d={inicial.verso} animatedProps={verso} fill="none" stroke="currentColor" strokeWidth={TRACO} />
      <Caminho d={inicial.frente} animatedProps={frente} fill="none" stroke="currentColor" strokeWidth={TRACO} />
    </Svg>
  );
}

/** One slice of the orange copy of the status, lit while the breath passes over it. */
function Fatia({ i, largura, texto, estilo, onda }: { i: number; largura: number; texto: string; estilo: TextStyle; onda: SharedValue<number> }) {
  const centro = (i + 0.5) * FATIA;
  const brilho = useAnimatedStyle(() => {
    const x = -BANDA + (largura + 2 * BANDA) * Math.min(1, onda.value / VARREDURA);
    const q = Math.max(0, 1 - Math.abs(centro - x) / BANDA);
    return { opacity: q * q * (3 - 2 * q) };
  }, [largura]);
  return (
    <Animated.View style={[{ position: 'absolute', top: 0, bottom: 0, left: i * FATIA, width: FATIA, overflow: 'hidden' }, brilho]}>
      <Text numberOfLines={1} style={[estilo, { position: 'absolute', top: 0, left: -i * FATIA, width: largura + 1, color: COR_LOGO }]}>{texto}</Text>
    </Animated.View>
  );
}

/**
 * The status with its breath: the text in the muted color, and over it an orange copy cut in thin
 * slices whose opacities follow the breath (one text layout, so the glyphs line up exactly).
 */
function Respiro({ texto, estilo, cor, onda }: { texto: string; estilo: TextStyle; cor: string; onda: SharedValue<number> }) {
  const [largura, setLargura] = useState(0);
  // Sized to the text, so the breath crosses the words and not the empty line after them.
  return (
    <View style={{ alignSelf: 'flex-start', maxWidth: '100%' }}>
      <Text numberOfLines={1} style={[estilo, { color: cor }]} onLayout={(e) => setLargura(Math.ceil(e.nativeEvent.layout.width))}>{texto}</Text>
      <View pointerEvents="none" aria-hidden style={{ position: 'absolute', top: 0, bottom: 0, left: 0, width: largura }}>
        {largura ? Array.from({ length: Math.ceil(largura / FATIA) }, (_, i) => (
          <Fatia key={i} i={i} largura={largura} texto={texto} estilo={estilo} onda={onda} />
        )) : null}
      </View>
    </View>
  );
}

export default function Andamento({ estado, texto, aoTentar, aoConcluir }: {
  estado: EstadoAndamento; texto: string; aoTentar?: () => void; aoConcluir?: () => void;
}) {
  const { colors, fonts, spacing, typography } = useTheme();
  const parado = useReducedMotion();
  const assentado = estado === 'erro' || estado === 'parado';
  const fase = useSharedValue(0);
  const onda = useSharedValue(0);
  const repouso = useSharedValue(assentado ? 1 : 0);
  const colapso = useSharedValue(0);
  const tom = useSharedValue(assentado ? 1 : 0);
  const entrada = useSharedValue(0);
  const status = useSharedValue(1);
  const recuo = useSharedValue(0);
  const relogio = useFrameCallback(({ timeSincePreviousFrame }) => {
    const dt = Math.min(timeSincePreviousFrame ?? 16, 50);
    fase.value += dt / PASSO_MS;
    onda.value = (onda.value + dt / ONDA_MS) % 1;
  }, false);
  const concluir = useEffectEvent(() => aoConcluir?.());
  // The text on screen lags the props while the old one fades out.
  const [mostrado, setMostrado] = useState({ texto, estado });

  useEffect(() => {
    entrada.set(withTiming(1, { duration: 220, easing: Easing.out(Easing.cubic) }));
  }, [entrada]);

  useEffect(() => {
    if (estado === 'pensando') {
      // From a settled mark (a retry) the loop starts over at the logo, which is where the mark is.
      if (repouso.get() > 0) {
        fase.set(0);
        repouso.set(0);
      }
      colapso.set(0);
      tom.set(withTiming(0, { duration: 240 }));
      relogio.setActive(!parado);
      return;
    }
    if (estado === 'escrevendo') {
      relogio.setActive(!parado);
      colapso.set(withTiming(1, { duration: COLAPSO_MS, easing: Easing.inOut(Easing.cubic) }));
      status.set(withTiming(0, { duration: 160, easing: Easing.in(Easing.cubic) }));
      recuo.set(withTiming(-10, { duration: 160, easing: Easing.in(Easing.cubic) }));
      const fim = setTimeout(() => {
        relogio.setActive(false);
        concluir();
      }, parado ? 0 : COLAPSO_MS);
      return () => clearTimeout(fim);
    }
    repouso.set(withTiming(1, { duration: REPOUSO_MS, easing: Easing.inOut(Easing.cubic) }));
    tom.set(withTiming(1, { duration: 260 }));
    const fim = setTimeout(() => relogio.setActive(false), REPOUSO_MS);
    return () => clearTimeout(fim);
  }, [estado, parado, relogio, fase, repouso, colapso, tom, status, recuo]);

  // A new status or message: the old one fades out, then the new one fades in.
  useEffect(() => {
    if (estado === 'escrevendo' || (texto === mostrado.texto && estado === mostrado.estado)) return;
    status.set(withTiming(0, { duration: TROCA_MS }));
    const troca = setTimeout(() => {
      setMostrado({ texto, estado });
      status.set(withTiming(1, { duration: 160 }));
    }, TROCA_MS);
    return () => clearTimeout(troca);
  }, [texto, estado, mostrado, status]);

  const linha = useAnimatedStyle(() => ({ opacity: entrada.value }));
  const lado = useAnimatedStyle(() => ({ opacity: status.value, transform: [{ translateX: recuo.value }] }));
  const estilo: TextStyle = { fontFamily: fonts.body, ...typography.base };
  const erro = mostrado.estado === 'erro';
  const corDoTexto = erro ? colors.foreground : colors.mutedForeground;

  return (
    <Animated.View testID="andamento" accessibilityLiveRegion="polite" style={[{ flexDirection: 'row', alignItems: 'flex-start', gap: 10 }, linha]}>
      <Marca fase={fase} repouso={repouso} colapso={colapso} tom={tom} cor={estado === 'erro' ? colors.danger : colors.mutedForeground} />
      <Animated.View style={[{ flex: 1, gap: spacing.sm, paddingTop: (ALTURA - typography.base.lineHeight) / 2 }, lado]}>
        {mostrado.estado === 'pensando' || mostrado.estado === 'escrevendo'
          ? <Respiro texto={mostrado.texto} estilo={estilo} cor={corDoTexto} onda={onda} />
          : <Text style={[estilo, { color: corDoTexto }]}>{mostrado.texto}</Text>}
        {erro && aoTentar ? (
          <Botao compacto v="secundario" icone="atualizar" rotulo="Tentar de novo" onPress={aoTentar} style={{ alignSelf: 'flex-start' }} />
        ) : null}
      </Animated.View>
    </Animated.View>
  );
}
