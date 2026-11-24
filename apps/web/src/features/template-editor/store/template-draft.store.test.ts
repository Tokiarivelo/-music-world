import { describe, expect, it, vi } from 'vitest';
import { NEON_NOCTURNE } from '@/templates/default';
import { setName, setPaletteColor } from '../lib/editor-model';
import { createDraftStore } from './template-draft.store';

describe('draft store', () => {
  it('starts on a clean copy and leaves the source alone', () => {
    const store = createDraftStore(NEON_NOCTURNE);
    const state = store.getState();
    expect(state.draft.name).toBe('Neon Nocturne (copy)');
    expect(state.source).toBe(NEON_NOCTURNE);
    expect(state.errors).toEqual([]);
    expect(state.dirty).toBe(false);
    store.update((d) => setName(d, 'Mine'));
    expect(NEON_NOCTURNE.name).toBe('Neon Nocturne');
  });

  it('keeps the last valid template while the draft is invalid', () => {
    const store = createDraftStore(NEON_NOCTURNE);
    const listener = vi.fn();
    store.subscribe(listener);
    store.update((d) => setName(d, 'Valid'));
    const valid = store.getState().lastValid;
    store.update((d) => setPaletteColor(d, 'staff', d.palette.background));
    const invalid = store.getState();
    expect(invalid.errors.map((e) => e.path)).toEqual(['palette.staff']);
    expect(invalid.lastValid).toBe(valid);
    expect(invalid.dirty).toBe(true);
    expect(listener).toHaveBeenCalledTimes(2);
    store.update((d) => d); // no change, no notification
    expect(listener).toHaveBeenCalledTimes(2);
  });

  it('marks saved, adds server errors and resets', () => {
    const store = createDraftStore(NEON_NOCTURNE);
    store.update((d) => setName(d, 'Mine'));
    store.markSaved('row-1');
    expect(store.getState()).toMatchObject({ draftId: 'row-1', dirty: false });
    store.reject([{ path: 'name', code: 'name' }]);
    expect(store.getState().errors).toEqual([{ path: 'name', code: 'name' }]);
    store.reset();
    expect(store.getState()).toMatchObject({ draftId: null, dirty: false, errors: [] });
    expect(store.getState().draft.name).toBe('Neon Nocturne (copy)');
  });
});
