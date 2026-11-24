import { describe, expect, it } from 'vitest';
import { NEON_NOCTURNE } from '@/templates/default';
import { clearStashedTemplate, HANDOFF_KEY, readStashedTemplate, stashTemplate, UNSAVED_KEY } from './template-stash';

function memory(): Storage {
  const data = new Map<string, string>();
  return {
    get length() {
      return data.size;
    },
    clear: () => data.clear(),
    getItem: (k) => data.get(k) ?? null,
    key: (i) => [...data.keys()][i] ?? null,
    removeItem: (k) => void data.delete(k),
    setItem: (k, v) => void data.set(k, v),
  };
}

describe('session draft', () => {
  it('round-trips a template and clears it', () => {
    const storage = memory();
    expect(stashTemplate(NEON_NOCTURNE, HANDOFF_KEY, storage)).toBe(true);
    expect(readStashedTemplate(HANDOFF_KEY, storage)).toEqual(NEON_NOCTURNE);
    clearStashedTemplate(HANDOFF_KEY, storage);
    expect(readStashedTemplate(HANDOFF_KEY, storage)).toBeNull();
  });

  it('keeps the handed-over template and the unsaved document apart', () => {
    const storage = memory();
    stashTemplate(NEON_NOCTURNE, UNSAVED_KEY, storage);
    expect(readStashedTemplate(HANDOFF_KEY, storage)).toBeNull();
    expect(readStashedTemplate(UNSAVED_KEY, storage)).toEqual(NEON_NOCTURNE);
  });

  it('ignores garbage and survives a throwing storage', () => {
    const storage = memory();
    storage.setItem(HANDOFF_KEY, '{"nope":1}');
    expect(readStashedTemplate(HANDOFF_KEY, storage)).toBeNull();
    const broken = { ...memory(), getItem: () => { throw new Error('blocked'); }, setItem: () => { throw new Error('blocked'); } } as Storage;
    expect(stashTemplate(NEON_NOCTURNE, HANDOFF_KEY, broken)).toBe(false);
    expect(readStashedTemplate(HANDOFF_KEY, broken)).toBeNull();
    expect(stashTemplate(NEON_NOCTURNE, HANDOFF_KEY, null)).toBe(false);
  });
});
