/**
 * Haptic vocabulary (plan §3.3) wrapping expo-haptics.
 *
 * Every call is guarded: on web, or when the native haptic API is not
 * available, the methods are a silent no-op (they resolve to undefined
 * without throwing), so screens can fire-and-forget `void haptics.send()`.
 */
import * as Haptics from 'expo-haptics';
import { Platform } from 'react-native';

function available(): boolean {
  // expo-haptics v57 exposes no availability probe; on web the module is a
  // no-op anyway, and every call below is try/catch-guarded.
  return Platform.OS !== 'web';
}

async function impact(style: Haptics.ImpactFeedbackStyle): Promise<void> {
  if (!available()) return;
  try {
    await Haptics.impactAsync(style);
  } catch {
    // Haptics are best-effort feedback; never break the action on failure.
  }
}

async function notification(type: Haptics.NotificationFeedbackType): Promise<void> {
  if (!available()) return;
  try {
    await Haptics.notificationAsync(type);
  } catch {
    // Best-effort, as above.
  }
}

export const haptics = {
  /** Question sent / FAQ pill tapped. */
  send: () => impact(Haptics.ImpactFeedbackStyle.Light),
  /** Like committed. */
  like: () => notification(Haptics.NotificationFeedbackType.Success),
  /** Dislike committed (with its reason). */
  dislike: () => notification(Haptics.NotificationFeedbackType.Warning),
  /** Error shown, including a 429 rate-limit message. */
  error: () => notification(Haptics.NotificationFeedbackType.Warning),
  /** Long response finished while the user scrolled away. */
  finished: () => notification(Haptics.NotificationFeedbackType.Success),
  /** Favorite toggled. */
  favorite: () => impact(Haptics.ImpactFeedbackStyle.Light),
};
