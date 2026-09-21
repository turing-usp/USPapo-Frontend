/**
 * How much of the screen the software keyboard is covering, in pt.
 *
 * Why this exists at all: the Android manifest asks for `adjustResize`, and
 * that used to be enough — the window shrank and the composer rode up with
 * it. Under edge-to-edge (the default since Android 15, and what Expo builds
 * now) the window no longer resizes for the IME: the keyboard is drawn OVER
 * the app, and an app that does nothing leaves its input underneath it. That
 * is exactly what was happening here — the student could not see what they
 * were typing.
 *
 * `KeyboardAvoidingView` is the usual answer, but it wants to own the layout
 * of whatever it wraps; the chat screen has a list, two absolutely
 * positioned scene overlays and a composer, and padding ONE of them is both
 * simpler and closer to what the old site does (its composer is a fixed
 * sibling of the scroller).
 *
 * The value is the keyboard's height MINUS the bottom safe-area inset the
 * caller already pays for, so `paddingBottom: Math.max(inset, gap) + altura`
 * never double-counts the gesture bar. iOS uses the `Will` events (they fire
 * with the animation, so the composer travels with the keyboard); Android
 * only has the `Did` ones.
 */
import { useEffect, useState } from 'react';
import { Keyboard, Platform } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

/**
 * Height of the keyboard overlap over the safe area, in pt (0 when the
 * keyboard is closed). Re-renders the caller as the keyboard opens/closes.
 */
export function useAlturaDoTeclado(): number {
  const insets = useSafeAreaInsets();
  const [altura, setAltura] = useState(0);

  useEffect(() => {
    // On iOS `keyboardWillShow` fires at the start of the slide-up, so the
    // composer animates WITH the keyboard instead of jumping after it.
    // Android does not emit the Will events at all.
    const abrir = Platform.OS === 'ios' ? 'keyboardWillShow' : 'keyboardDidShow';
    const fechar = Platform.OS === 'ios' ? 'keyboardWillHide' : 'keyboardDidHide';

    const aoAbrir = Keyboard.addListener(abrir, (e) => {
      const bruta = e?.endCoordinates?.height ?? 0;
      // The IME covers the gesture bar / home indicator too, and the caller
      // is already padding for that inset.
      setAltura(Math.max(0, bruta - insets.bottom));
    });
    const aoFechar = Keyboard.addListener(fechar, () => setAltura(0));

    return () => {
      aoAbrir.remove();
      aoFechar.remove();
    };
  }, [insets.bottom]);

  // The browser moves the visual viewport itself; adding padding on top of
  // that would push the composer off screen.
  return Platform.OS === 'web' ? 0 : altura;
}
