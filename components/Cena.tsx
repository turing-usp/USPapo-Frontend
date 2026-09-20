/**
 * The scene: one still backdrop, registered as the blur target for every
 * glass surface in the app.
 *
 * On Android `expo-blur` blurs *nothing* unless each BlurView is given a
 * `blurTarget` pointing at a `<BlurTargetView>` — `ExpoBlurView.kt` bails out
 * when it is null. That is why the glass read as flat transparency: the blur
 * was never being asked to sample anything. This wraps the backdrop in that
 * target once, at the layout level, and publishes the ref through context so
 * <Glass> can pick it up wherever it is rendered — including the drawer and
 * the floating chrome, which live outside the screen tree.
 *
 * Keeping the backdrop here rather than inside each screen also makes it
 * genuinely static during navigation. That was unsafe while the navigator ran
 * its own transitions (a transparent screen cannot hide the one below), but
 * the stacks now use `animation: 'none'` and animate their content in via
 * components/Tela, so no two screens are ever on screen at once.
 */
import React, {
  createContext,
  useContext,
  useRef,
  type ReactNode,
  type RefObject,
} from 'react';
import { StyleSheet, View } from 'react-native';
import { BlurTargetView } from 'expo-blur';

import Backdrop from './Backdrop';

const AlvoDeVidro = createContext<RefObject<View | null> | null>(null);

/** The blur target for glass panes; null when rendered outside a <Cena>. */
export function useAlvoDeVidro(): RefObject<View | null> | null {
  return useContext(AlvoDeVidro);
}

export default function Cena({ children }: { children: ReactNode }) {
  const alvo = useRef<View | null>(null);

  return (
    <View style={{ flex: 1 }}>
      {/* What the glass samples. Nothing interactive lives in here. */}
      <BlurTargetView ref={alvo} style={StyleSheet.absoluteFill}>
        <Backdrop />
      </BlurTargetView>

      <AlvoDeVidro.Provider value={alvo}>{children}</AlvoDeVidro.Provider>
    </View>
  );
}
