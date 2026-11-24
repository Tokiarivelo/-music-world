'use client';

import { useCallback, useState } from 'react';
import { ApiError } from '@/lib/api-error';
import { requestMagicLink } from '../api/auth.api';

export type MagicLinkStatus = 'idle' | 'sending' | 'sent' | 'error';

export interface MagicLinkState {
  status: MagicLinkStatus;
  errorKey: string | null;
  sentTo: string | null;
  send(email: string): void;
}

/** Sends the sign-in link; the answer is the same whether or not an account exists. */
export function useMagicLink(request: (email: string) => Promise<void> = requestMagicLink): MagicLinkState {
  const [status, setStatus] = useState<MagicLinkStatus>('idle');
  const [errorKey, setErrorKey] = useState<string | null>(null);
  const [sentTo, setSentTo] = useState<string | null>(null);
  const send = useCallback(
    (email: string) => {
      const address = email.trim();
      setStatus('sending');
      setErrorKey(null);
      request(address).then(
        () => {
          setSentTo(address);
          setStatus('sent');
        },
        (error: unknown) => {
          setErrorKey(error instanceof ApiError ? error.code : 'UNKNOWN');
          setStatus('error');
        },
      );
    },
    [request],
  );
  return { status, errorKey, sentTo, send };
}
