'use client';

import { useEffect, useState } from 'react';
import type { StoreTemplate } from '@/templates/generated';
import { ApiError } from '@/lib/api-error';
import { listMyTemplates } from '../api/template-store.api';

export interface MyTemplatesState {
  status: 'loading' | 'ready' | 'error';
  errorKey: string | null;
  items: readonly StoreTemplate[];
}

/** The signed-in user's own templates (drafts, published, hidden after reports). */
export function useMyTemplates(list: () => Promise<StoreTemplate[]> = listMyTemplates): MyTemplatesState {
  const [state, setState] = useState<MyTemplatesState>({ status: 'loading', errorKey: null, items: [] });
  useEffect(() => {
    let alive = true;
    list().then(
      (items) => alive && setState({ status: 'ready', errorKey: null, items }),
      (error: unknown) =>
        alive && setState({ status: 'error', errorKey: error instanceof ApiError ? error.code : 'UNKNOWN', items: [] }),
    );
    return () => {
      alive = false;
    };
  }, [list]);
  return state;
}
