import { afterEach, describe, expect, it, vi } from 'vitest';
import { ApiError } from './api-error';
import { apiFetch, readCsrfToken } from './api-client';

afterEach(() => {
  vi.unstubAllGlobals();
  document.cookie = 'mw_csrf=; max-age=0';
});

describe('api client', () => {
  it('reads the CSRF cookie', () => {
    expect(readCsrfToken('a=1; mw_csrf=abc%3D; b=2')).toBe('abc=');
    expect(readCsrfToken('a=1')).toBeNull();
  });

  it('sends the CSRF header on unsafe methods only', async () => {
    document.cookie = 'mw_csrf=tok';
    const fetchMock = vi.fn(async () => new Response('{}', { status: 200 }));
    vi.stubGlobal('fetch', fetchMock);
    await apiFetch('/api/x', { method: 'POST' });
    await apiFetch('/api/x');
    const calls = fetchMock.mock.calls as unknown as [string, RequestInit][];
    expect(new Headers(calls[0]![1].headers).get('X-CSRF-Token')).toBe('tok');
    expect(new Headers(calls[1]![1].headers).get('X-CSRF-Token')).toBeNull();
  });

  it('maps errors to ApiError', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn(async () => Response.json({ error: { code: 'AUTH_REQUIRED' } }, { status: 401 })),
    );
    await expect(apiFetch('/api/x')).rejects.toMatchObject({ code: 'AUTH_REQUIRED', status: 401 });
    vi.stubGlobal(
      'fetch',
      vi.fn(async () => Promise.reject(new TypeError('offline'))),
    );
    await expect(apiFetch('/api/x')).rejects.toBeInstanceOf(ApiError);
  });
});
