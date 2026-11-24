'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import type { StoreTemplate } from '@/templates/generated';
import { ApiError } from '@/lib/api-error';
import { listStoreTemplates, type StorePage } from '../api/template-store.api';
import { GALLERY_PAGE_SIZE } from '../consts/template-store.consts';

export interface GalleryState {
  status: 'loading' | 'ready' | 'error';
  errorKey: string | null;
  items: readonly StoreTemplate[];
  hasMore: boolean;
  loadMore(): void;
}

/** Published templates, newest first, page by page (`nextCursor`). */
export function useGallery(
  list: (cursor: string | null, limit: number) => Promise<StorePage> = listStoreTemplates,
): GalleryState {
  const [status, setStatus] = useState<GalleryState['status']>('loading');
  const [errorKey, setErrorKey] = useState<string | null>(null);
  const [items, setItems] = useState<readonly StoreTemplate[]>([]);
  const [cursor, setCursor] = useState<string | null>(null);
  const alive = useRef(true);

  const load = useCallback(
    (from: string | null) => {
      list(from, GALLERY_PAGE_SIZE).then(
        (page) => {
          if (!alive.current) return;
          setItems((prev) => {
            const seen = new Set(prev.map((t) => t.id));
            return [...prev, ...page.items.filter((t) => !seen.has(t.id))];
          });
          setCursor(page.nextCursor);
          setStatus('ready');
        },
        (error: unknown) => {
          if (!alive.current) return;
          setErrorKey(error instanceof ApiError ? error.code : 'UNKNOWN');
          setStatus('error');
        },
      );
    },
    [list],
  );

  useEffect(() => {
    alive.current = true;
    load(null);
    return () => {
      alive.current = false;
    };
  }, [load]);

  const loadMore = useCallback(() => {
    if (!cursor) return;
    setStatus('loading');
    load(cursor);
  }, [cursor, load]);
  return { status, errorKey, items, hasMore: cursor !== null, loadMore };
}
