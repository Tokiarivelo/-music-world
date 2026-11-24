import { act, renderHook, waitFor } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import { ApiError } from '@/lib/api-error';
import { PROVIDERS, result } from '../test-fixtures';
import type { DirectorSource } from '../interfaces/director.interfaces';
import { useDirector, type DirectorApi } from './use-director';

const SOURCE: DirectorSource = { kind: 'project', projectId: 'p1' };

describe('useDirector', () => {
  it('lists configured providers only and starts on the default', async () => {
    const api: DirectorApi = { getProviders: async () => PROVIDERS, generate: vi.fn() };
    const hook = renderHook(() => useDirector(SOURCE, api));
    await waitFor(() => expect(hook.result.current.status).toBe('idle'));
    expect(hook.result.current.providers.map((p) => p.id)).toEqual(['muse', 'mock']);
    expect(hook.result.current.provider).toBe('muse');
  });

  it('keeps every generated template (regenerating with another provider never overwrites)', async () => {
    const replies = [result('muse', 'ai-muse-1'), result('mock', 'ai-mock-1'), result('muse', 'ai-muse-1')];
    const generate = vi.fn(async () => replies.shift()!);
    const api: DirectorApi = { getProviders: async () => PROVIDERS, generate };
    const hook = renderHook(() => useDirector(SOURCE, api));
    await waitFor(() => expect(hook.result.current.status).toBe('idle'));
    act(() => hook.result.current.generate());
    await waitFor(() => expect(hook.result.current.templates).toHaveLength(1));
    act(() => hook.result.current.setProvider('mock'));
    act(() => hook.result.current.generate());
    await waitFor(() => expect(hook.result.current.templates).toHaveLength(2));
    expect(generate).toHaveBeenLastCalledWith(SOURCE, 'mock');
    act(() => hook.result.current.generate());
    await waitFor(() => expect(hook.result.current.latest?.template.id).toBe('ai-muse-1'));
    expect(hook.result.current.templates.map((t) => t.id)).toEqual(['ai-mock-1', 'ai-muse-1']);
  });

  it('reports errors by code and falls back to mock when providers cannot be listed', async () => {
    const api: DirectorApi = {
      getProviders: async () => {
        throw new ApiError('NETWORK', 0);
      },
      generate: async () => {
        throw new ApiError('RATE_LIMITED', 429);
      },
    };
    const hook = renderHook(() => useDirector(SOURCE, api));
    await waitFor(() => expect(hook.result.current.status).toBe('idle'));
    expect(hook.result.current.providers.map((p) => p.id)).toEqual(['mock']);
    act(() => hook.result.current.generate());
    await waitFor(() => expect(hook.result.current.errorKey).toBe('RATE_LIMITED'));
    expect(hook.result.current.status).toBe('error');
  });
});
