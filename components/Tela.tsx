/**
 * Screen shell: content that animates itself in over the shared scene.
 *
 * Getting all three of these at once took some doing, because the navigator's
 * own transitions can only give two:
 *
 *   - `slide_from_right` drags the backdrop across with the screen, because
 *     the backdrop lives inside the screen that is moving;
 *   - `fade` keeps the backdrop still (consecutive screens paint an identical
 *     one) but cross-fades the *content*, so both screens are visible at once
 *     for a few frames;
 *   - `none` has no motion at all.
 *
 * So the stack is set to `animation: 'none'` — the swap is instant and the two
 * screens never overlap — and the entrance is animated here instead, on the
 * content alone. The backdrop is outside that animation and identical on every
 * screen, so the scene reads as perfectly still while the content rises and
 * fades in over it.
 *
 * Applied through each stack's `screenLayout`, so screens don't opt in.
 */
import React, { useEffect, useState, type ReactNode } from 'react';
import { Animated, Easing, View } from 'react-native';


/** Close to the old site's `duration-200 ease-in-out` content transitions. */
const DURACAO = 220;
/** How far the content travels up as it arrives (pt). */
const DESLOCAMENTO = 10;

export default function Tela({ children }: { children: ReactNode }) {
  const [entrada] = useState(() => new Animated.Value(0));

  useEffect(() => {
    Animated.timing(entrada, {
      toValue: 1,
      duration: DURACAO,
      easing: Easing.out(Easing.cubic),
      useNativeDriver: true,
    }).start();
  }, [entrada]);

  return (
    <View style={{ flex: 1 }}>
      <Animated.View
        style={{
          flex: 1,
          opacity: entrada,
          transform: [
            {
              translateY: entrada.interpolate({
                inputRange: [0, 1],
                outputRange: [DESLOCAMENTO, 0],
              }),
            },
          ],
        }}
      >
        {children}
      </Animated.View>
    </View>
  );
}
