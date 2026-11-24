import { act, renderHook, waitFor } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import { NEON_NOCTURNE } from '@/templates/default';
import { setPaletteColor } from '../lib/editor-model';
import { useEditorSource, type EditorSourceApi } from './use-editor-source';

function api(over: Partial<EditorSourceApi> = {}): EditorSourceApi {
  return {
    getStoreTemplate: vi.fn(async () => ({ template: { ...NEON_NOCTURNE, name: 'From store' } })),
    readStashed: vi.fn(() => null),
    ...over,
  };
}

describe('useEditorSource', () => {
  it('starts from the default template without `from`, and from a built-in id without a request', async () => {
    const fake = api();
    const none = renderHook(() => useEditorSource(null, fake));
    expect(none.result.current).toMatchObject({ status: 'ready', source: NEON_NOCTURNE });
    const builtin = renderHook(() => useEditorSource('neon-nocturne', fake));
    await waitFor(() => expect(builtin.result.current.status).toBe('ready'));
    expect(fake.getStoreTemplate).not.toHaveBeenCalled();
  });

  it('loads a store template, or the stashed one for `from=session`', async () => {
    const fake = api({ readStashed: vi.fn(() => ({ ...NEON_NOCTURNE, name: 'Stashed' })) });
    const store = renderHook(() => useEditorSource('0190-abc', fake));
    await waitFor(() => expect(store.result.current.status).toBe('ready'));
    expect(store.result.current).toMatchObject({ source: { name: 'From store' } });
    const session = renderHook(() => useEditorSource('session', fake));
    await waitFor(() => expect(session.result.current.status).toBe('ready'));
    expect(session.result.current).toMatchObject({ source: { name: 'Stashed' } });
  });

  it('reports a failed or invalid source and falls back to the default', async () => {
    const missing = api({ getStoreTemplate: vi.fn(async () => Promise.reject(new Error('404'))) });
    const hook = renderHook(() => useEditorSource('0190-abc', missing));
    await waitFor(() => expect(hook.result.current.status).toBe('error'));
    act(() => hook.result.current.fallbackToDefault());
    expect(hook.result.current).toMatchObject({ status: 'ready', source: NEON_NOCTURNE });
    const invalid = api({
      getStoreTemplate: vi.fn(async () => ({ template: setPaletteColor(NEON_NOCTURNE, 'staff', NEON_NOCTURNE.palette.background) })),
    });
    const bad = renderHook(() => useEditorSource('0190-abc', invalid));
    await waitFor(() => expect(bad.result.current).toMatchObject({ status: 'error', errorKey: 'INVALID' }));
    const noStash = api();
    const empty = renderHook(() => useEditorSource('session', noStash));
    await waitFor(() => expect(empty.result.current).toMatchObject({ status: 'error', errorKey: 'NOT_FOUND' }));
  });
});
