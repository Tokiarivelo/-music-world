'use client';

import { useCallback, useEffect, useState } from 'react';
import type { Session } from '@/templates/generated';
import { getSession, signOut as apiSignOut } from '../api/auth.api';

export type SessionUser = NonNullable<Session['user']>;

export interface SessionApi {
  getSession(): Promise<Session>;
  signOut(): Promise<void>;
}

export interface SessionState {
  status: 'loading' | 'ready';
  /** Null when signed out (or when the API cannot be reached: the app keeps working signed out). */
  user: SessionUser | null;
  signOut(): void;
}

const DEFAULT_API: SessionApi = { getSession, signOut: apiSignOut };

/** The signed-in user, read from `GET /api/auth/session` (the session cookie itself is httpOnly). */
export function useSession(api: SessionApi = DEFAULT_API): SessionState {
  const [status, setStatus] = useState<SessionState['status']>('loading');
  const [user, setUser] = useState<SessionUser | null>(null);

  useEffect(() => {
    let alive = true;
    api
      .getSession()
      .then((s) => s.user)
      .catch(() => null)
      .then((u) => {
        if (!alive) return;
        setUser(u);
        setStatus('ready');
      });
    return () => {
      alive = false;
    };
  }, [api]);

  const signOut = useCallback(() => {
    api.signOut().then(
      () => setUser(null),
      () => setUser(null),
    );
  }, [api]);

  return { status, user, signOut };
}
