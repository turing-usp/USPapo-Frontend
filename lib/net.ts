/**
 * Connectivity watcher + offline question queue (plan §9, light offline).
 *
 * - useConnection(): { online: boolean } — module-level state defaults to
 *   online until the first network event arrives, then follows the device.
 * - queue: offline queue for questions asked while the network is down
 *   (persisted as JSON under the AsyncStorage key 'queue:pending', FIFO).
 *   The composer shows the badge; on reconnect the screen fires the items
 *   back through lib/api with retry.
 *
 * NOTE: built on `expo-network` (already a project dependency) instead of
 * `react-native-netinfo`: the current react-native-netinfo release was not
 * available in this environment's package registry (only the deprecated
 * 1.x stub was), and expo-network is the Expo-native connectivity API.
 */
import AsyncStorage from '@react-native-async-storage/async-storage';
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
};

const QUEUE_KEY = 'queue:pending';

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

function parseItems(raw: string | null): QueueItem[] {
  if (!raw) return [];
  try {
    const parsed: unknown = JSON.parse(raw);
    return Array.isArray(parsed) ? (parsed as QueueItem[]) : [];
  } catch {
    // Corrupt queue (partial write): treat as empty rather than crash the
    // composer badge.
    return [];
  }
}

/** Offline queue, FIFO, persisted under the AsyncStorage key 'queue:pending'. */
export const queue = {
  /** Appends an item to the tail of the queue. */
  async enqueue(item: QueueItem): Promise<void> {
    const items = await queue.pending();
    items.push(item);
    await AsyncStorage.setItem(QUEUE_KEY, JSON.stringify(items));
  },

  /** Removes and returns the oldest item (or null when the queue is empty). */
  async dequeue(): Promise<QueueItem | null> {
    const items = await queue.pending();
    if (items.length === 0) return null;
    const [next, ...rest] = items;
    await AsyncStorage.setItem(QUEUE_KEY, JSON.stringify(rest));
    return next;
  },

  /** All queued items, oldest first. */
  async pending(): Promise<QueueItem[]> {
    const raw = await AsyncStorage.getItem(QUEUE_KEY);
    return parseItems(raw);
  },

  /** Drops the whole queue. */
  async clear(): Promise<void> {
    await AsyncStorage.removeItem(QUEUE_KEY);
  },
};
