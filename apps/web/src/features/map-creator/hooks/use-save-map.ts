'use client';

import { useCallback, useState } from 'react';
import { createStoreTemplate, updateStoreTemplate } from '@/features/template-store';
import { ApiError } from '@/lib/api-error';
import type { StoreTemplate, Template } from '@/templates/generated';

export interface SaveMapApi {
  create(template: Template, publish: boolean): Promise<StoreTemplate>;
  update(id: string, template: Template): Promise<StoreTemplate>;
}

const DEFAULT_API: SaveMapApi = { create: createStoreTemplate, update: updateStoreTemplate };

export type SaveMapStatus = 'idle' | 'saving' | 'saved' | 'error';

export interface SaveMap {
  readonly status: SaveMapStatus;
  readonly errorKey: string | null;
  /** Id of the saved draft, set after the first save (or when a saved map is reopened). */
  readonly savedId: string | null;
  save(template: Template): void;
  /** Adopts the id of an already saved map (reopened or restored from the browser draft). */
  adopt(id: string | null): void;
}

/** Saves the map as a private template draft: `POST` the first time, `PUT` after (same storage and moderation as templates). */
export function useSaveMap(initialId: string | null = null, api: SaveMapApi = DEFAULT_API): SaveMap {
  const [status, setStatus] = useState<SaveMapStatus>('idle');
  const [errorKey, setErrorKey] = useState<string | null>(null);
  const [savedId, setSavedId] = useState<string | null>(initialId);
  const save = useCallback(
    (template: Template) => {
      setStatus('saving');
      setErrorKey(null);
      const done = savedId === null ? api.create(template, false) : api.update(savedId, template);
      done.then(
        (stored) => { setSavedId(stored.id); setStatus('saved'); },
        (error: unknown) => { setErrorKey(error instanceof ApiError ? error.code : 'UNKNOWN'); setStatus('error'); },
      );
    },
    [api, savedId],
  );
  return { status, errorKey, savedId, save, adopt: setSavedId };
}
