import { renderHook, waitFor } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import { NEON_NOCTURNE } from '@/templates/default';
import { stored } from '../test-fixtures';
import { useStoreTemplates, type StoreTemplatesApi } from './use-store-templates';

const A = stored();
const B = stored({ id: 'b', template: { ...NEON_NOCTURNE, id: 'old-one-12345678' } });

describe('useStoreTemplates', () => {
  it('loads the newest templates and the requested one', async () => {
    const api: StoreTemplatesApi = {
      list: vi.fn(async () => ({ items: [A], nextCursor: null })),
      get: vi.fn(async () => B),
    };
    const hook = renderHook(() => useStoreTemplates('b', api));
    await waitFor(() => expect(hook.result.current.templates).toHaveLength(2));
    expect(hook.result.current.templates.map((t) => t.id)).toEqual(['old-one-12345678', A.template.id]);
    expect(hook.result.current.requestedTemplateId).toBe('old-one-12345678');
    expect(api.list).toHaveBeenCalledWith(null, 12);
  });

  it('keeps the player working when the store is down', async () => {
    const api: StoreTemplatesApi = {
      list: vi.fn(async () => Promise.reject(new Error('down'))),
      get: vi.fn(async () => Promise.reject(new Error('down'))),
    };
    const hook = renderHook(() => useStoreTemplates('b', api));
    await waitFor(() => expect(api.get).toHaveBeenCalled());
    expect(hook.result.current).toEqual({ templates: [], requestedTemplateId: null });
  });
});
