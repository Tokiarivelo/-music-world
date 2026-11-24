'use client';

import { useEffect, useRef, useState } from 'react';
import type { Session } from '@/templates/generated';
import { ApiError } from '@/lib/api-error';
import { verifyMagicLink } from '../api/auth.api';

export type VerifyStatus = 'verifying' | 'verified' | 'error' | 'missing';

export interface VerifyState {
  status: VerifyStatus;
  errorKey: string | null;
}

/** Posts the link token once (a scanner that only GETs the page never consumes it), then hides it from the URL. */
export function useVerifyMagicLink(
  token: string | null,
  verify: (token: string) => Promise<Session> = verifyMagicLink,
): VerifyState {
  const [state, setState] = useState<VerifyState>({ status: token ? 'verifying' : 'missing', errorKey: null });
  const started = useRef(false);
  useEffect(() => {
    if (!token || started.current) return;
    started.current = true; // React strict mode runs effects twice: a second POST would fail (single-use token)
    window.history.replaceState(null, '', window.location.pathname);
    verify(token).then(
      () => setState({ status: 'verified', errorKey: null }),
      (error: unknown) =>
        setState({ status: 'error', errorKey: error instanceof ApiError ? error.code : 'UNKNOWN' }),
    );
  }, [token, verify]);
  return state;
}
