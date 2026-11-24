import { act, renderHook, waitFor } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import { useSession, type SessionApi } from './use-session';

const USER = { id: 'u1', email: 'ada@example.com', displayName: 'creator-abc123' };

describe('useSession', () => {
  it('loads the user and signs out', async () => {
    const api: SessionApi = { getSession: vi.fn(async () => ({ user: USER })), signOut: vi.fn(async () => undefined) };
    const hook = renderHook(() => useSession(api));
    expect(hook.result.current.status).toBe('loading');
    await waitFor(() => expect(hook.result.current.user).toEqual(USER));
    act(() => hook.result.current.signOut());
    await waitFor(() => expect(hook.result.current.user).toBeNull());
    expect(api.signOut).toHaveBeenCalledOnce();
  });

  it('is signed out when the API cannot be reached', async () => {
    const api: SessionApi = { getSession: vi.fn(async () => Promise.reject(new Error('down'))), signOut: vi.fn() };
    const hook = renderHook(() => useSession(api));
    await waitFor(() => expect(hook.result.current.status).toBe('ready'));
    expect(hook.result.current.user).toBeNull();
  });
});
