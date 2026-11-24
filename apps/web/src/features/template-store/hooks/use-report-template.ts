'use client';

import { useCallback, useState } from 'react';
import { ApiError } from '@/lib/api-error';
import { reportStoreTemplate } from '../api/template-store.api';
import type { ReportReason } from '../consts/template-store.consts';

export interface ReportState {
  status: 'idle' | 'sending' | 'sent' | 'error';
  errorKey: string | null;
  report(reason: ReportReason): void;
}

/** Reports a store template (signed in); the server keeps one report per user. */
export function useReportTemplate(
  storeId: string,
  send: (id: string, reason: ReportReason) => Promise<void> = reportStoreTemplate,
): ReportState {
  const [status, setStatus] = useState<ReportState['status']>('idle');
  const [errorKey, setErrorKey] = useState<string | null>(null);
  const report = useCallback(
    (reason: ReportReason) => {
      setStatus('sending');
      send(storeId, reason).then(
        () => setStatus('sent'),
        (error: unknown) => {
          setErrorKey(error instanceof ApiError ? error.code : 'UNKNOWN');
          setStatus('error');
        },
      );
    },
    [send, storeId],
  );
  return { status, errorKey, report };
}
