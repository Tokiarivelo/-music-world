import { act, renderHook, waitFor } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import { ApiError } from '@/lib/api-error';
import type { StoreTemplate } from '@/templates/generated';
import { createMap } from '../lib/map-model';
import { useSaveMap, type SaveMapApi } from './use-save-map';

const map = createMap({ name: 'm', from: null, environment: 'city', plateSize: 12, seed: 1 });
const stored = (id: string) => ({ id }) as StoreTemplate;

describe('useSaveMap', () => {
  it('creates the draft the first time, then updates it', async () => {
    const api: SaveMapApi = { create: vi.fn().mockResolvedValue(stored('d1')), update: vi.fn().mockResolvedValue(stored('d1')) };
    const { result } = renderHook(() => useSaveMap(null, api));
    act(() => result.current.save(map));
    await waitFor(() => expect(result.current.status).toBe('saved'));
    expect(api.create).toHaveBeenCalledWith(map, false);
    expect(result.current.savedId).toBe('d1');
    act(() => result.current.save(map));
    await waitFor(() => expect(api.update).toHaveBeenCalledWith('d1', map));
  });

  it('updates a reopened map straight away', async () => {
    const api: SaveMapApi = { create: vi.fn(), update: vi.fn().mockResolvedValue(stored('x')) };
    const { result } = renderHook(() => useSaveMap('x', api));
    act(() => result.current.save(map));
    await waitFor(() => expect(result.current.status).toBe('saved'));
    expect(api.create).not.toHaveBeenCalled();
  });

  it('reports the error code', async () => {
    const api: SaveMapApi = { create: vi.fn().mockRejectedValue(new ApiError('TEMPLATE_INVALID', 422)), update: vi.fn() };
    const { result } = renderHook(() => useSaveMap(null, api));
    act(() => result.current.save(map));
    await waitFor(() => expect(result.current.status).toBe('error'));
    expect(result.current.errorKey).toBe('TEMPLATE_INVALID');
  });
});
