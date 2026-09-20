/**
 * Haptic vocabulary (plan §3.3) wrapping expo-haptics.
 *
 * Three rules hold the whole module together:
 *
 * 1. **Never break the action.** Every call is guarded and returns a resolved
 *    promise, so screens can fire-and-forget `void haptics.send()`. On web,
 *    or when the native API is missing, the methods are a silent no-op.
 * 2. **One tap, one tap back.** Calls are throttled: a burst of events in the
 *    same moment (a list settling, a stream finishing as an error lands)
 *    produces a single sensation instead of a stutter. Notifications are
 *    stronger and get a longer window than selections.
 * 3. **The user decides.** The whole layer can be switched off from Ajustes
 *    and the choice is persisted, so it survives a restart.
 *
 * The vocabulary is deliberately small and named for *meaning*, not for the
 * underlying waveform — screens should say what happened, and this module
 * decides how that feels.
 */
import * as Haptics from 'expo-haptics';
import { Platform } from 'react-native';
import AsyncStorage from '@react-native-async-storage/async-storage';

/** AsyncStorage key for the on/off preference. */
export const HAPTICS_STORAGE_KEY = 'haptics:enabled';

/**
 * Cached preference. Starts enabled so the very first interaction after a
 * cold start still responds; `carregarPreferencia` corrects it as soon as
 * storage answers, and `setHapticsEnabled` is authoritative after that.
 */
let habilitado = true;

type Listener = (ativo: boolean) => void;
const listeners = new Set<Listener>();

/**
 * Read the persisted preference. Called once by the root layout; safe to
 * call again (it simply re-reads).
 */
export async function carregarPreferencia(): Promise<boolean> {
  try {
    const bruto = await AsyncStorage.getItem(HAPTICS_STORAGE_KEY);
    if (bruto === 'off') habilitado = false;
    else if (bruto === 'on') habilitado = true;
  } catch {
    // Storage unavailable (tests, first run): keep the default.
  }
  return habilitado;
}

/** Current preference, without touching storage. */
export function hapticsEnabled(): boolean {
  return habilitado;
}

/** Persist and apply the preference; notifies any subscribed screen. */
export async function setHapticsEnabled(ativo: boolean): Promise<void> {
  habilitado = ativo;
  listeners.forEach((l) => l(ativo));
  try {
    await AsyncStorage.setItem(HAPTICS_STORAGE_KEY, ativo ? 'on' : 'off');
  } catch {
    // In-memory only: the toggle still reflects the change this session.
  }
}

/** Subscribe to preference changes (the Ajustes switch). */
export function observarHaptics(listener: Listener): () => void {
  listeners.add(listener);
  return () => {
    listeners.delete(listener);
  };
}

function disponivel(): boolean {
  // expo-haptics v57 exposes no availability probe; on web the module is a
  // no-op anyway, and every call below is try/catch-guarded.
  return habilitado && Platform.OS !== 'web';
}

/**
 * Throttle window per channel. Selections repeat fastest (a finger moving
 * through a list), notifications are the strongest and must not stack.
 */
const JANELA = { selection: 60, impact: 90, notification: 400 } as const;
const ultimo: Record<keyof typeof JANELA, number> = {
  selection: 0,
  impact: 0,
  notification: 0,
};

function permitido(canal: keyof typeof JANELA): boolean {
  const agora = Date.now();
  if (agora - ultimo[canal] < JANELA[canal]) return false;
  ultimo[canal] = agora;
  return true;
}

async function impact(estilo: Haptics.ImpactFeedbackStyle): Promise<void> {
  if (!disponivel() || !permitido('impact')) return;
  try {
    await Haptics.impactAsync(estilo);
  } catch {
    // Haptics are best-effort feedback; never break the action on failure.
  }
}

async function notification(tipo: Haptics.NotificationFeedbackType): Promise<void> {
  if (!disponivel() || !permitido('notification')) return;
  try {
    await Haptics.notificationAsync(tipo);
  } catch {
    // Best-effort, as above.
  }
}

async function selection(): Promise<void> {
  if (!disponivel() || !permitido('selection')) return;
  try {
    await Haptics.selectionAsync();
  } catch {
    // Best-effort, as above.
  }
}

export const haptics = {
  // ── Navigation and choices ──────────────────────────────────────────
  /** Drawer opened/closed, a nav row taken, a segmented option picked. */
  selection: () => selection(),
  /** A switch or theme option committed. */
  toggle: () => selection(),

  // ── Actions ─────────────────────────────────────────────────────────
  /** Question sent / FAQ pill tapped. */
  send: () => impact(Haptics.ImpactFeedbackStyle.Light),
  /** A weightier press: stopping a stream, a destructive confirm. */
  press: () => impact(Haptics.ImpactFeedbackStyle.Medium),
  /** Favorite toggled. */
  favorite: () => impact(Haptics.ImpactFeedbackStyle.Light),

  // ── Outcomes ────────────────────────────────────────────────────────
  /** Like committed. */
  like: () => notification(Haptics.NotificationFeedbackType.Success),
  /** Dislike committed (with its reason) — a caution, not a failure. */
  dislike: () => notification(Haptics.NotificationFeedbackType.Warning),
  /** Something actually failed: network down, 401, 429, save rejected. */
  error: () => notification(Haptics.NotificationFeedbackType.Error),
  /** Long response finished while the user scrolled away. */
  finished: () => notification(Haptics.NotificationFeedbackType.Success),
};
