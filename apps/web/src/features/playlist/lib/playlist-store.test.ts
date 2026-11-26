import { describe, expect, it } from 'vitest';
import { entriesOf, readPlaylist, recordPlay, removeEntry, upsertEntry, writePlaylist, PLAYLIST_STORAGE_KEY } from './playlist-store';

describe('playlist store', () => {
  it('adds a song once, keeps the uploaded title, and counts plays with fresh metadata', () => {
    let list = upsertEntry([], 'p1', 'u1', { title: 'My song' }, 10);
    list = recordPlay(list, 'p1', 'u1', { title: 'Your song', durationSec: 120, key: 'C major', tempoBpm: 99, templateRef: 's1' }, 20);
    list = recordPlay(list, 'p1', 'u1', { title: 'Your song' }, 30);
    expect(list).toHaveLength(1);
    expect(list[0]).toMatchObject({ title: 'My song', plays: 2, lastPlayedAt: 30, durationSec: 120, templateRef: 's1', addedAt: 10 });
  });

  it('shows a user only their own songs, most recent first', () => {
    let list = recordPlay([], 'a', 'u1', { title: 'A' }, 10);
    list = recordPlay(list, 'b', 'u1', { title: 'B' }, 20);
    list = recordPlay(list, 'c', 'u2', { title: 'C' }, 30);
    list = recordPlay(list, 'd', null, { title: 'D' }, 40);
    expect(entriesOf(list, 'u1').map((e) => e.id)).toEqual(['b', 'a']);
    expect(entriesOf(list, 'u2').map((e) => e.id)).toEqual(['c']);
    expect(entriesOf(list, null).map((e) => e.id)).toEqual(['d']);
    expect(entriesOf(removeEntry(list, 'a', 'u1'), 'u1').map((e) => e.id)).toEqual(['b']);
  });

  it('round-trips through storage and ignores corrupt data', () => {
    const data = new Map<string, string>();
    const storage = { getItem: (k: string) => data.get(k) ?? null, setItem: (k: string, v: string) => void data.set(k, v) };
    writePlaylist(storage, recordPlay([], 'a', null, { title: 'A' }, 1));
    expect(readPlaylist(storage)).toHaveLength(1);
    data.set(PLAYLIST_STORAGE_KEY, '{not json');
    expect(readPlaylist(storage)).toEqual([]);
    data.set(PLAYLIST_STORAGE_KEY, JSON.stringify([{ nope: 1 }, 3]));
    expect(readPlaylist(storage)).toEqual([]);
  });
});
