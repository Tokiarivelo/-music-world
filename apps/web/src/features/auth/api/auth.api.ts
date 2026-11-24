import { SessionSchema, type Session } from '@/templates/generated';
import { apiFetch, apiJson } from '@/lib/api-client';

const JSON_HEADERS = { 'content-type': 'application/json' };

/** `POST /api/auth/magic-link`: always 202 for a valid address (no account enumeration). */
export async function requestMagicLink(email: string): Promise<void> {
  await apiFetch('/api/auth/magic-link', { method: 'POST', headers: JSON_HEADERS, body: JSON.stringify({ email }) });
}

/** `POST /api/auth/verify`: exchanges the link token for the httpOnly session cookie. */
export async function verifyMagicLink(token: string): Promise<Session> {
  const init = { method: 'POST', headers: JSON_HEADERS, body: JSON.stringify({ token }) };
  return SessionSchema.parse(await apiJson('/api/auth/verify', init));
}

/** `GET /api/auth/session`, validated with `music-world.session.v1`. */
export async function getSession(): Promise<Session> {
  return SessionSchema.parse(await apiJson('/api/auth/session', { cache: 'no-store' }));
}

/** `POST /api/auth/logout` (sends the CSRF header). */
export async function signOut(): Promise<void> {
  await apiFetch('/api/auth/logout', { method: 'POST' });
}
