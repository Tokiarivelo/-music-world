import { describe, expect, it } from 'vitest';
import { NEON_NOCTURNE } from '@/templates/default';
import { clearStashedTemplate, readStashedTemplate, stashTemplate } from './session-draft';

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
    expect(stashTemplate(NEON_NOCTURNE, storage)).toBe(true);
    expect(readStashedTemplate(storage)).toEqual(NEON_NOCTURNE);
    clearStashedTemplate(storage);
    expect(readStashedTemplate(storage)).toBeNull();
  });

  it('ignores garbage and survives a throwing storage', () => {
    const storage = memory();
    storage.setItem('mw.editor.draft', '{"nope":1}');
    expect(readStashedTemplate(storage)).toBeNull();
    const broken = { ...memory(), getItem: () => { throw new Error('blocked'); }, setItem: () => { throw new Error('blocked'); } } as Storage;
    expect(stashTemplate(NEON_NOCTURNE, broken)).toBe(false);
    expect(readStashedTemplate(broken)).toBeNull();
    expect(stashTemplate(NEON_NOCTURNE, null)).toBe(false);
  });
});
