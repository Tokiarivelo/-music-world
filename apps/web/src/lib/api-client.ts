import { ApiError, apiErrorFrom } from './api-error';

/** Cookie set at sign-in and echoed in `X-CSRF-Token` on unsafe requests (double-submit token). */
export const CSRF_COOKIE = 'mw_csrf';
export const CSRF_HEADER = 'X-CSRF-Token';
const SAFE_METHODS = new Set(['GET', 'HEAD', 'OPTIONS']);

/** Value of the CSRF cookie, or null when signed out (or outside the browser). */
export function readCsrfToken(cookies: string = typeof document === 'undefined' ? '' : document.cookie): string | null {
  for (const part of cookies.split(';')) {
    const [name, ...rest] = part.trim().split('=');
    if (name === CSRF_COOKIE) return decodeURIComponent(rest.join('='));
  }
  return null;
}

/** `fetch` for `/api/*`: adds the CSRF header to unsafe methods, maps network and HTTP errors to `ApiError`. */
export async function apiFetch(url: string, init: RequestInit = {}): Promise<Response> {
  const method = (init.method ?? 'GET').toUpperCase();
  const headers = new Headers(init.headers);
  const csrf = SAFE_METHODS.has(method) ? null : readCsrfToken();
  if (csrf !== null) headers.set(CSRF_HEADER, csrf);
  const response = await fetch(url, { ...init, headers, credentials: 'same-origin' }).catch(() => {
    throw new ApiError('NETWORK', 0);
  });
  if (!response.ok) throw await apiErrorFrom(response);
  return response;
}

/** `apiFetch` then the JSON body (validate it with the generated zod schema). */
export async function apiJson(url: string, init?: RequestInit): Promise<unknown> {
  return (await apiFetch(url, init)).json();
}
