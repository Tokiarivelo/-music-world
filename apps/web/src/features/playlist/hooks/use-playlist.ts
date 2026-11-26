'use client';

import { useCallback, useSyncExternalStore } from 'react';
import { useSession } from '@/features/auth';
import {
  entriesOf,
  readPlaylist,
  recordPlay,
  removeEntry,
  upsertEntry,
  writePlaylist,
  type PlaylistEntry,
  type PlaylistPatch,
  PLAYLIST_STORAGE_KEY,
} from '../lib/playlist-store';

const storage = (): Storage | null => {
  try {
    return typeof window === 'undefined' ? null : window.localStorage;
  } catch {
    return null;
  }
};

const EMPTY: readonly PlaylistEntry[] = [];
const listeners = new Set<() => void>();
let cache: { raw: string | null; list: readonly PlaylistEntry[] } = { raw: null, list: EMPTY };

/** The stored list, the same array until the stored text changes (what `useSyncExternalStore` needs). */
function snapshot(): readonly PlaylistEntry[] {
  let raw: string | null = null;
  try {
    raw = storage()?.getItem(PLAYLIST_STORAGE_KEY) ?? null;
  } catch {
    raw = null;
  }
  if (raw !== cache.raw) cache = { raw, list: raw === null ? EMPTY : readPlaylist({ getItem: () => raw }) };
  return cache.list;
}

function subscribe(listener: () => void): () => void {
  listeners.add(listener);
  window.addEventListener('storage', listener); // another tab
  return () => {
    listeners.delete(listener);
    window.removeEventListener('storage', listener);
  };
}

/** Update the stored list from its latest content (another tab may have changed it), save it and tell the readers. */
function change(update: (list: readonly PlaylistEntry[]) => PlaylistEntry[]): void {
  writePlaylist(storage(), update(readPlaylist(storage())));
  for (const listener of listeners) listener();
}

export interface PlaylistApi {
  /** False until the session is known (a play recorded earlier would be filed under the guest). */
  ready: boolean;
  entries: readonly PlaylistEntry[];
  remove(id: string): void;
  /** Adds an uploaded song with the name of its file. */
  add(id: string, title: string, patch?: PlaylistPatch): void;
  /** A play of the song starts. */
  played(id: string, title: string, patch?: PlaylistPatch): void;
}

/** The signed-in user's played songs (or the guest's); they live in this browser only. */
export function usePlaylist(): PlaylistApi {
  const { user, status } = useSession();
  const ownerId = user?.id ?? null;
  const all = useSyncExternalStore(subscribe, snapshot, () => EMPTY);
  const remove = useCallback((id: string) => change((l) => removeEntry(l, id, ownerId)), [ownerId]);
  const add = useCallback(
    (id: string, title: string, patch: PlaylistPatch = {}) => change((l) => upsertEntry(l, id, ownerId, { ...patch, title }, Date.now())),
    [ownerId],
  );
  const played = useCallback(
    (id: string, title: string, patch: PlaylistPatch = {}) => change((l) => recordPlay(l, id, ownerId, { ...patch, title }, Date.now())),
    [ownerId],
  );
  return { ready: status === 'ready', entries: entriesOf(all, ownerId), remove, add, played };
}
