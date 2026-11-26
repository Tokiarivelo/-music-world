import { describe, expect, it } from 'vitest';
import { clearMapDraft, loadMapDraft, MAP_DRAFT_KEY, saveMapDraft } from './map-draft-storage';
import { createMap, placeObject } from './map-model';

class MemoryStorage implements Storage {
  private data = new Map<string, string>();
  get length() { return this.data.size; }
  clear() { this.data.clear(); }
  getItem(k: string) { return this.data.get(k) ?? null; }
  key(i: number) { return [...this.data.keys()][i] ?? null; }
  removeItem(k: string) { this.data.delete(k); }
  setItem(k: string, v: string) { this.data.set(k, v); }
}

const map = () => placeObject(createMap({ name: 'm', from: null, environment: 'city', plateSize: 12, seed: 4 }), 'tree', 1, 2).template;

describe('map draft storage', () => {
  it('round-trips the map and its saved id', () => {
    const s = new MemoryStorage();
    expect(saveMapDraft(map(), 'abc', s)).toBe(true);
    const back = loadMapDraft(s)!;
    expect(back.savedId).toBe('abc');
    expect(back.template.layout?.placed).toHaveLength(1);
    expect(back.template).toEqual(map());
  });

  it('ignores corrupt or invalid content', () => {
    const s = new MemoryStorage();
    s.setItem(MAP_DRAFT_KEY, '{not json');
    expect(loadMapDraft(s)).toBeNull();
    s.setItem(MAP_DRAFT_KEY, JSON.stringify({ template: { id: 1 } }));
    expect(loadMapDraft(s)).toBeNull();
  });

  it('survives blocked storage', () => {
    const blocked = { setItem() { throw new Error('quota'); }, getItem() { throw new Error('blocked'); }, removeItem() { throw new Error('x'); } } as unknown as Storage;
    expect(saveMapDraft(map(), null, blocked)).toBe(false);
    expect(loadMapDraft(blocked)).toBeNull();
    expect(() => clearMapDraft(blocked)).not.toThrow();
    expect(saveMapDraft(map(), null, null)).toBe(false);
  });

  it('clears', () => {
    const s = new MemoryStorage();
    saveMapDraft(map(), null, s);
    clearMapDraft(s);
    expect(loadMapDraft(s)).toBeNull();
  });
});
