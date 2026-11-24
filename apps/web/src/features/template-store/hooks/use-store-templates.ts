'use client';

import { useEffect, useState } from 'react';
import type { StoreTemplate, Template } from '@/templates/generated';
import { getStoreTemplate, listStoreTemplates, type StorePage } from '../api/template-store.api';
import { PLAYER_STORE_LIMIT } from '../consts/template-store.consts';

export interface StoreTemplatesApi {
  list(cursor: string | null, limit: number): Promise<StorePage>;
  get(id: string): Promise<StoreTemplate>;
}

const DEFAULT_API: StoreTemplatesApi = { list: listStoreTemplates, get: getStoreTemplate };

export interface StoreTemplatesState {
  /** Newest published store templates (plus the `?template=` one), already validated. */
  templates: readonly Template[];
  /** Template id (not store id) of the `?template=` store template once loaded, else null. */
  requestedTemplateId: string | null;
}

const EMPTY: StoreTemplatesState = { templates: [], requestedTemplateId: null };

/** Store templates for the player's picker; if the store cannot be reached the player keeps its own templates. */
export function useStoreTemplates(
  requestedStoreId: string | null = null,
  api: StoreTemplatesApi = DEFAULT_API,
): StoreTemplatesState {
  const [state, setState] = useState<StoreTemplatesState>(EMPTY);
  useEffect(() => {
    let alive = true;
    const page = api.list(null, PLAYER_STORE_LIMIT).catch((): StorePage => ({ items: [], nextCursor: null }));
    const requested = requestedStoreId ? api.get(requestedStoreId).catch(() => null) : Promise.resolve(null);
    Promise.all([page, requested]).then(([list, one]) => {
      if (!alive) return;
      const items = one && !list.items.some((t) => t.id === one.id) ? [one, ...list.items] : list.items;
      setState({ templates: items.map((t) => t.template), requestedTemplateId: one?.template.id ?? null });
    });
    return () => {
      alive = false;
    };
  }, [api, requestedStoreId]);
  return state;
}
