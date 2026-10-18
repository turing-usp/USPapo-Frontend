/**
 * The bubbly motion, on Reanimated (the UI thread: every frame at 120 Hz, from the tap itself).
 *
 * - A pane or control pops in on a quick spring, a little past its size and back, the glass first
 *   and its content a beat later (`useSurgimento`, `Surgir`), and shrinks away faster.
 * - A pressed control gives under the finger and springs back a little past its size
 *   (`Pressionavel`, and every pressable Glass).
 *
 * With the system's reduced motion on, Reanimated skips each animation to its end.
 */
import React, { useEffect, useRef, useState, type ReactNode } from 'react';
import { Pressable, type GestureResponderEvent, type MouseEvent, type PressableProps, type StyleProp, type ViewStyle } from 'react-native';
import Reanimated, {
  Easing, runOnJS, useAnimatedStyle, useSharedValue, withDelay, withSequence, withSpring, withTiming, type SharedValue,
} from 'react-native-reanimated';

/** The pop: ~0.35 s, its top a quarter of the travel past the end (0.85 -> 1.04 -> 1). */
export const MOLA = { damping: 14, stiffness: 420, mass: 0.7 } as const;
/** Back from a press: livelier, ~1% past full size. */
const SOLTURA = { damping: 12, stiffness: 520, mass: 0.6 } as const;
const APERTO = { duration: 90, easing: Easing.out(Easing.quad) };
const SAIDA = { duration: 120, easing: Easing.in(Easing.quad) };
const FADE = { duration: 140, easing: Easing.out(Easing.quad) };

/** What moves a pane: a Glass applies it to the pane itself (on the web a wrapper's fade would cut its blur off). */
export type Movimento = { opacidade?: SharedValue<number>; escala?: SharedValue<number>; y?: SharedValue<number> };

/** A Movimento as a style, times a press (`aperto`) and a fade (`tom`), over a resting opacity. */
export function useEstiloDoMovimento(movimento?: Movimento, aperto?: SharedValue<number>, base = 1, tom?: SharedValue<number>) {
  return useAnimatedStyle(() => ({
    opacity: base * (movimento?.opacidade?.value ?? 1) * (tom?.value ?? 1),
    transform: [{ translateY: movimento?.y?.value ?? 0 }, { scale: (movimento?.escala?.value ?? 1) * (aperto?.value ?? 1) }],
  }), [base, movimento, aperto, tom]);
}

/** A swell and a bounce back, on any scale (the aviso pill as its dot lights up again). */
export function pulsar(escala: SharedValue<number>, ate = 1.06, atraso = 0): void {
  escala.set(withDelay(atraso, withSequence(withTiming(ate, { duration: 150, easing: Easing.out(Easing.quad) }), withSpring(1, MOLA))));
}

type OpcoesDoSurgimento = { de?: number; atraso?: number; animar?: boolean };

/** The values behind `useSurgimento` and `Surgir`. */
function useAparicao(visivel: boolean, { de = 0.85, atraso = 0, animar = true }: OpcoesDoSurgimento) {
  const opacidade = useSharedValue(visivel && !animar ? 1 : 0);
  const escala = useSharedValue(animar ? de : 1);
  const [movimento] = useState(() => ({ opacidade, escala }));
  const [montado, setMontado] = useState(visivel);
  if (visivel && !montado) setMontado(true);
  const visto = useRef(visivel);

  useEffect(() => {
    if (visivel) {
      visto.current = true;
      if (!animar) {
        opacidade.set(1);
        escala.set(1);
        return;
      }
      const quadro = requestAnimationFrame(() => {
        opacidade.set(withDelay(atraso, withTiming(1, FADE)));
        escala.set(withDelay(atraso, withSpring(1, MOLA)));
      });
      return () => cancelAnimationFrame(quadro);
    }
    if (!visto.current) return; // never shown: nothing to hide
    opacidade.set(withTiming(0, SAIDA, (fim) => {
      if (fim) runOnJS(setMontado)(false);
    }));
    escala.set(withTiming(1 - (1 - de) / 2, SAIDA, (fim) => {
      if (fim) escala.set(de);
    }));
  }, [visivel, animar, atraso, de, opacidade, escala]);
  return { montado, movimento };
}

/**
 * Shows and hides a pane: `montado` while it is visible or leaving, `movimento` for its Glass and
 * `conteudo` for what is inside it (a beat after the glass). `animar` false shows it at once. The
 * pop starts a frame after mounting: the frames right after a mount are the long ones, and would
 * swallow its start.
 */
export function useSurgimento(visivel: boolean, opcoes: OpcoesDoSurgimento = {}) {
  const { montado, movimento } = useAparicao(visivel, opcoes);
  const { opacidade } = movimento;
  const conteudo = useAnimatedStyle(() => ({ opacity: Math.max(0, (opacidade.value - 0.4) / 0.6) }));
  return { montado, movimento: movimento as Movimento, conteudo };
}

/**
 * Pops its children in once, when it mounts (`animar` false: shown as is). `origem` is where it
 * grows from; `deslocamento` adds a rise from below. Never around a blurred Glass on the web (its
 * fade would cut the blur off): give that Glass a `movimento` instead.
 */
export function Surgir({ children, animar = true, de = 0.85, atraso, origem, deslocamento = 0, style }: {
  children: ReactNode; animar?: boolean; de?: number; atraso?: number; origem?: string; deslocamento?: number; style?: StyleProp<ViewStyle>;
}) {
  const { movimento: { opacidade, escala } } = useAparicao(true, { de, atraso, animar });
  const estilo = useAnimatedStyle(() => {
    const p = de < 1 ? (escala.value - de) / (1 - de) : 1;
    return { opacity: opacidade.value, transform: [{ translateY: (1 - p) * deslocamento }, { scale: escala.value }] };
  }, [de, deslocamento]);
  return <Reanimated.View style={[style, origem ? { transformOrigin: origem } : null, estilo]}>{children}</Reanimated.View>;
}

const PressavelAnimado = Reanimated.createAnimatedComponent(Pressable);

export type PressionavelProps = Omit<PressableProps, 'style'> & {
  style?: StyleProp<ViewStyle>;
  /** The scale under the finger (1: it does not give). */
  aperto?: number;
  /** A solid fill also fades a little under the mouse and the finger (the palette has no lighter orange). */
  desbotar?: boolean;
  /** Its resting opacity (a disabled button). */
  opacidade?: number;
  movimento?: Movimento;
};

/** A Pressable that gives under the finger and springs back; its style is static (the state goes to its children). */
export function Pressionavel({
  aperto = 0.96, desbotar, opacidade = 1, movimento, style, disabled, onPressIn, onPressOut, onHoverIn, onHoverOut, ...props
}: PressionavelProps) {
  const escala = useSharedValue(1);
  const tom = useSharedValue(1);
  const sobre = useRef(false);
  const estilo = useEstiloDoMovimento(movimento, escala, opacidade, tom);
  const repousar = () => tom.set(withTiming(desbotar && sobre.current ? 0.92 : 1, FADE));
  return (
    <PressavelAnimado
      {...props}
      disabled={disabled}
      onPressIn={(e: GestureResponderEvent) => {
        escala.set(withTiming(aperto, APERTO));
        if (desbotar) tom.set(withTiming(0.85, APERTO));
        onPressIn?.(e);
      }}
      onPressOut={(e: GestureResponderEvent) => {
        escala.set(withSpring(1, SOLTURA));
        repousar();
        onPressOut?.(e);
      }}
      onHoverIn={(e: MouseEvent) => {
        sobre.current = true;
        repousar();
        onHoverIn?.(e);
      }}
      onHoverOut={(e: MouseEvent) => {
        sobre.current = false;
        repousar();
        onHoverOut?.(e);
      }}
      style={[style, estilo]}
    />
  );
}
