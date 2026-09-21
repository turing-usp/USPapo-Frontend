/**
 * Connectivity watcher + offline question queue (plan §9, light offline).
 *
 * - useConnection(): { online: boolean } — module-level state defaults to
 *   online until the first network event arrives, then follows the device.
 * - queue: offline queue for questions asked while the network is down
 *   (FIFO). P9: the queue is persisted on the SAME backend as the offline
 *   conversation cache (lib/cache, the 'uspapo' SQLite database — the
 *   `fila_offline` table), so it survives an app restart. The composer
 *   shows the badge; on reconnect lib/offline's trigger calls the
 *   `reprocessarFila` coordinator (app/(main)/chat/useChat), which
 *   re-sends the items in order through the normal streamChat path.
 * - filaPendente(): the UI-facing read (the badge / the replay surface).
 *
 * NOTE: built on `expo-network` (already a project dependency) instead of
 * `react-native-netinfo`: the current react-native-netinfo release was not
 * available in this environment's package registry (only the deprecated
 * 1.x stub was), and expo-network is the Expo-native connectivity API.
 */
import { filaOffline } from './cache';
import { addNetworkStateListener, type NetworkStateEvent } from 'expo-network';
import { useEffect, useState } from 'react';

/** One queued question (visible state: question + timestamp). */
export type QueueItem = {
  /** Client-generated id for the queued item. */
  id: string;
  /** Conversation the question belongs to (uuid). */
  conversationId: string;
  /** The question text. */
  question: string;
  /** Enqueue timestamp (ms since epoch). */
  enqueuedAt: number;
  /**
   * Position of the turn inside the conversation (`mensagens.ordem`). A
   * conversation is a list of turns now, so the replay has to complete the
   * turn that was pending, not always the first one. Absent (older queued
   * items, the home screen's first question) means turn 0.
   */
  turno?: number;
};

// Module-level state: latest known connectivity, shared by every hook
// instance. Default: online until the first event says otherwise.
let knownOnline = true;

function toOnline(state: NetworkStateEvent): boolean {
  return state.isConnected !== false && state.isInternetReachable !== false;
}

/**
 * Connection state for a screen. Subscribes to network state changes and
 * reports `online` (starts from the module-level default: true until the
 * first event).
 */
export function useConnection(): { online: boolean } {
  const [online, setOnline] = useState(knownOnline);

  useEffect(() => {
    const subscription = addNetworkStateListener((state) => {
      knownOnline = toOnline(state);
      setOnline(knownOnline);
    });
    return () => {
      subscription.remove();
    };
  }, []);

  return { online };
}

/**
 * Offline queue, FIFO. Persistence: the shared offline backend (lib/cache,
 * the same SQLite database as the conversation cache — P9: "the queue is
 * persisted on the same backend as the cache").
 *
 * `enqueue` de-duplicates by conversationId: one conversation is queued at
 * most once (the home screen parks a question on `!online`, and the chat
 * send path parks it again on the actual fetch failure — the second call
 * refreshes the question text and keeps the queue position instead of
 * piling up a duplicate).
 */
export const queue = {
  /**
   * Appends an item to the tail of the queue (or `naFrente`: to the FRONT,
   * used when the replay gives an unanswered item back without losing its
   * place in the order).
   */
  async enqueue(item: QueueItem, naFrente = false): Promise<void> {
    const atuais = await filaOffline.listar();
    const existente = atuais.find((i) => i.conversationId === item.conversationId);
    if (existente) await filaOffline.remover(existente.id);
    await filaOffline.inserir(item, naFrente);
  },

  /** Removes and returns the oldest item (or null when the queue is empty). */
  async dequeue(): Promise<QueueItem | null> {
    const [maisAntigo] = await filaOffline.listar();
    if (!maisAntigo) return null;
    await filaOffline.remover(maisAntigo.id);
    return maisAntigo;
  },

  /** All queued items, oldest first. */
  async pending(): Promise<QueueItem[]> {
    return filaOffline.listar();
  },

  /** Drops the whole queue. */
  async clear(): Promise<void> {
    await filaOffline.limpar();
  },
};

/**
 * All queued items, oldest first — the UI surface (the composer badge)
 * and the replay coordinator's read.
 */
export function filaPendente(): Promise<QueueItem[]> {
  return queue.pending();
}
