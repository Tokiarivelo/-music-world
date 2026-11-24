'use client';

import { useCallback, useEffect, useState } from 'react';
import { ApiError } from '@/lib/api-error';
import { decide, listQueue, type QueueItem, type QueuePage } from '../api/moderation.api';
import type { Decision } from '../consts/moderation.consts';

export interface ModerationApi {
  list(cursor: string | null): Promise<QueuePage>;
  decide(storeId: string, decision: Decision): Promise<void>;
}

const DEFAULT_API: ModerationApi = { list: (cursor) => listQueue(cursor), decide };

export interface ModerationQueueState {
  status: 'loading' | 'ready' | 'error';
  items: readonly QueueItem[];
  hasMore: boolean;
  /** Id of the template whose decision is being sent. */
  pending: string | null;
  errorKey: string | null;
  loadMore(): void;
  decide(storeId: string, decision: Decision): void;
}

function errorKeyOf(error: unknown): string {
  return error instanceof ApiError ? error.code : 'UNKNOWN';
}

/** The review queue: first page on mount, "load more", and restore / remove (the item leaves the list on success). */
export function useModerationQueue(api: ModerationApi = DEFAULT_API): ModerationQueueState {
  const [status, setStatus] = useState<ModerationQueueState['status']>('loading');
  const [items, setItems] = useState<readonly QueueItem[]>([]);
  const [cursor, setCursor] = useState<string | null>(null);
  const [pending, setPending] = useState<string | null>(null);
  const [errorKey, setErrorKey] = useState<string | null>(null);

  useEffect(() => {
    let alive = true;
    api.list(null).then(
      (page) => {
        if (!alive) return;
        setItems(page.items);
        setCursor(page.nextCursor);
        setStatus('ready');
      },
      (error: unknown) => {
        if (!alive) return;
        setErrorKey(errorKeyOf(error));
        setStatus('error');
      },
    );
    return () => {
      alive = false;
    };
  }, [api]);

  const loadMore = useCallback(() => {
    if (cursor === null) return;
    api.list(cursor).then(
      (page) => {
        setItems((current) => [...current, ...page.items.filter((i) => !current.some((c) => c.template.id === i.template.id))]);
        setCursor(page.nextCursor);
      },
      (error: unknown) => setErrorKey(errorKeyOf(error)),
    );
  }, [api, cursor]);

  const decideOn = useCallback(
    (storeId: string, decision: Decision) => {
      setPending(storeId);
      setErrorKey(null);
      api.decide(storeId, decision).then(
        () => {
          setItems((current) => current.filter((i) => i.template.id !== storeId));
          setPending(null);
        },
        (error: unknown) => {
          // 409: someone else already decided: the item is gone from the queue either way.
          if (error instanceof ApiError && error.code === 'TEMPLATE_NOT_HIDDEN') {
            setItems((current) => current.filter((i) => i.template.id !== storeId));
          }
          setErrorKey(errorKeyOf(error));
          setPending(null);
        },
      );
    },
    [api],
  );

  return { status, items, hasMore: cursor !== null, pending, errorKey, loadMore, decide: decideOn };
}
