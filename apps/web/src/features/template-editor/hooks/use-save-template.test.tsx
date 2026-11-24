import { act, renderHook, waitFor } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import { ApiError } from '@/lib/api-error';
import { NEON_NOCTURNE } from '@/templates/default';
import { stored } from '../../template-store/test-fixtures';
import { setName, setPaletteColor } from '../lib/editor-model';
import { createDraftStore } from '../store/template-draft.store';
import { useSaveTemplate, type SaveApi } from './use-save-template';

function api(over: Partial<SaveApi> = {}): SaveApi {
  return {
    create: vi.fn(async () => stored({ id: 'row-1' })),
    update: vi.fn(async () => stored({ id: 'row-1' })),
    publish: vi.fn(async () => stored({ id: 'row-1' })),
    uploadThumbnail: vi.fn(async () => stored()),
    renderThumbnail: vi.fn(async () => new Blob(['x'], { type: 'image/webp' })),
    clearUnsaved: vi.fn(),
    ...over,
  };
}

function setup(fake: SaveApi) {
  const store = createDraftStore(NEON_NOCTURNE);
  store.update((d) => setName(d, 'Mine'));
  return { store, hook: renderHook(() => useSaveTemplate(store, fake)) };
}

describe('useSaveTemplate', () => {
  it('creates a draft once, then replaces it with PUT', async () => {
    const fake = api();
    const { store, hook } = setup(fake);
    act(() => hook.result.current.save());
    await waitFor(() => expect(hook.result.current.status).toBe('saved'));
    expect(fake.create).toHaveBeenCalledWith(store.getState().draft, false);
    expect(store.getState()).toMatchObject({ draftId: 'row-1', dirty: false });
    expect(fake.clearUnsaved).toHaveBeenCalled();
    act(() => store.update((d) => setName(d, 'Mine v2')));
    act(() => hook.result.current.save());
    await waitFor(() => expect(fake.update).toHaveBeenCalledWith('row-1', store.getState().draft));
    expect(fake.create).toHaveBeenCalledTimes(1);
  });

  it('publishes a saved draft with its thumbnail, and the next save starts a new draft', async () => {
    const fake = api();
    const { store, hook } = setup(fake);
    act(() => hook.result.current.save());
    await waitFor(() => expect(hook.result.current.status).toBe('saved'));
    act(() => hook.result.current.publish());
    await waitFor(() => expect(hook.result.current.status).toBe('published'));
    expect(fake.update).not.toHaveBeenCalled(); // not dirty: nothing to replace
    expect(fake.publish).toHaveBeenCalledWith('row-1');
    expect(fake.uploadThumbnail).toHaveBeenCalledWith('row-1', expect.any(Blob));
    expect(store.getState().draftId).toBeNull();
  });

  it('publishes a new document in one call, keeping the publication when the thumbnail fails', async () => {
    const fake = api({ uploadThumbnail: vi.fn(async () => Promise.reject(new Error('x'))) });
    const { hook } = setup(fake);
    act(() => hook.result.current.publish());
    await waitFor(() => expect(hook.result.current.status).toBe('published'));
    expect(fake.create).toHaveBeenCalledWith(expect.anything(), true);
  });

  it('does nothing while the draft is invalid', () => {
    const fake = api();
    const { store, hook } = setup(fake);
    act(() => store.update((d) => setPaletteColor(d, 'staff', d.palette.background)));
    act(() => hook.result.current.save());
    expect(fake.create).not.toHaveBeenCalled();
    expect(hook.result.current.status).toBe('idle');
  });

  it('maps a server rejection to the fields', async () => {
    const rejection = new ApiError('TEMPLATE_INVALID', 422, [{ loc: ['template', 'palette', 'accent'], msg: 'bad' }]);
    const { store, hook } = setup(api({ create: vi.fn(async () => Promise.reject(rejection)) }));
    act(() => hook.result.current.save());
    await waitFor(() => expect(hook.result.current.status).toBe('error'));
    expect(hook.result.current.errorKey).toBe('TEMPLATE_INVALID');
    expect(store.getState().errors).toEqual([{ path: 'palette.accent', code: 'schema' }]);
    const other = setup(api({ create: vi.fn(async () => Promise.reject(new Error('boom'))) }));
    act(() => other.hook.result.current.save());
    await waitFor(() => expect(other.hook.result.current.errorKey).toBe('UNKNOWN'));
  });
});
