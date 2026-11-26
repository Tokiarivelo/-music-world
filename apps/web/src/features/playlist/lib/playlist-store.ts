/**
 * Songs a user has played (I40): kept in the browser of the user who plays them, never sent to the server, so no other
 * user can see them. Every entry carries the id of the signed-in user (null for a guest); a page only shows its own.
 */
export interface PlaylistEntry {
  /** Project id, or `demo`. */
  readonly id: string;
  readonly ownerId: string | null;
  readonly title: string;
  readonly durationSec: number | null;
  readonly key: string | null;
  readonly tempoBpm: number | null;
  /** Store id of the template chosen for this song, or null for the default one. */
  readonly templateRef: string | null;
  readonly addedAt: number;
  readonly lastPlayedAt: number | null;
  readonly plays: number;
}

export const PLAYLIST_STORAGE_KEY = 'mw.playlist.v1';
export const PLAYLIST_MAX = 200;

const isEntry = (v: unknown): v is PlaylistEntry => {
  if (typeof v !== 'object' || v === null) return false;
  const e = v as Record<string, unknown>;
  return typeof e.id === 'string' && typeof e.title === 'string' && typeof e.addedAt === 'number' && typeof e.plays === 'number';
};

export function readPlaylist(storage: Pick<Storage, 'getItem'> | null): PlaylistEntry[] {
  try {
    const raw = storage?.getItem(PLAYLIST_STORAGE_KEY);
    const parsed: unknown = raw ? JSON.parse(raw) : [];
    return Array.isArray(parsed) ? parsed.filter(isEntry).map((e) => ({ ...e, ownerId: e.ownerId ?? null, templateRef: e.templateRef ?? null })) : [];
  } catch {
    return [];
  }
}

export function writePlaylist(storage: Pick<Storage, 'setItem'> | null, entries: readonly PlaylistEntry[]): void {
  try {
    storage?.setItem(PLAYLIST_STORAGE_KEY, JSON.stringify(entries.slice(0, PLAYLIST_MAX)));
  } catch {
    // storage full or blocked: the playlist is a convenience, the app keeps working
  }
}

export type PlaylistPatch = Partial<Omit<PlaylistEntry, 'id' | 'ownerId' | 'addedAt' | 'plays'>>;

const same = (e: PlaylistEntry, id: string, ownerId: string | null): boolean => e.id === id && e.ownerId === ownerId;

/** Adds the song (when it is new) or updates its metadata; the entry moves to the front only when it is new. */
export function upsertEntry(
  list: readonly PlaylistEntry[],
  id: string,
  ownerId: string | null,
  patch: PlaylistPatch & { title: string },
  now: number,
): PlaylistEntry[] {
  const found = list.find((e) => same(e, id, ownerId));
  if (!found) {
    const created: PlaylistEntry = {
      id,
      ownerId,
      title: patch.title,
      durationSec: patch.durationSec ?? null,
      key: patch.key ?? null,
      tempoBpm: patch.tempoBpm ?? null,
      templateRef: patch.templateRef ?? null,
      addedAt: now,
      lastPlayedAt: patch.lastPlayedAt ?? null,
      plays: 0,
    };
    return [created, ...list].slice(0, PLAYLIST_MAX);
  }
  // The title typed at upload wins over the generic fallback title used by a later play.
  const defined = Object.fromEntries(Object.entries(patch).filter(([k, v]) => k !== 'title' && v !== undefined));
  return list.map((e) => (e === found ? { ...e, ...defined } : e));
}

/** A play: counts it, stamps the time and refreshes the metadata of the song. */
export function recordPlay(
  list: readonly PlaylistEntry[],
  id: string,
  ownerId: string | null,
  meta: PlaylistPatch & { title: string },
  now: number,
): PlaylistEntry[] {
  const updated = upsertEntry(list, id, ownerId, { ...meta, lastPlayedAt: now }, now);
  return updated.map((e) => (same(e, id, ownerId) ? { ...e, plays: e.plays + 1 } : e));
}

export function removeEntry(list: readonly PlaylistEntry[], id: string, ownerId: string | null): PlaylistEntry[] {
  return list.filter((e) => !same(e, id, ownerId));
}

/** What one user sees: their own songs, most recently played first. */
export function entriesOf(list: readonly PlaylistEntry[], ownerId: string | null): PlaylistEntry[] {
  return list.filter((e) => e.ownerId === ownerId).sort((a, b) => (b.lastPlayedAt ?? b.addedAt) - (a.lastPlayedAt ?? a.addedAt));
}
