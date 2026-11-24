'use client';

import { useCallback, useState } from 'react';
import {
  createStoreTemplate,
  publishStoreTemplate,
  renderThumbnail,
  updateStoreTemplate,
  uploadThumbnail,
} from '@/features/template-store';
import { ApiError } from '@/lib/api-error';
import { clearStashedTemplate, UNSAVED_KEY } from '@/lib/template-stash';
import type { StoreTemplate, Template } from '@/templates/generated';
import type { DraftStore } from '../store/template-draft.store';
import { pathFromLoc } from '../lib/editor-validate';

export interface SaveApi {
  create(template: Template, publish: boolean): Promise<StoreTemplate>;
  update(id: string, template: Template): Promise<StoreTemplate>;
  publish(id: string): Promise<StoreTemplate>;
  uploadThumbnail(id: string, image: Blob): Promise<StoreTemplate>;
  renderThumbnail(template: Template): Promise<Blob | null>;
  clearUnsaved(): void;
}

const DEFAULT_API: SaveApi = {
  create: createStoreTemplate,
  update: updateStoreTemplate,
  publish: publishStoreTemplate,
  uploadThumbnail,
  renderThumbnail,
  clearUnsaved: () => clearStashedTemplate(UNSAVED_KEY),
};

export type SaveStatus = 'idle' | 'saving' | 'saved' | 'publishing' | 'published' | 'error';

export interface SaveState {
  status: SaveStatus;
  errorKey: string | null;
  save(): void;
  publish(): void;
}

/**
 * Save draft (`POST` once, then `PUT`) and publish (thumbnail included, like the store's publish flow). A server
 * `TEMPLATE_INVALID` puts its `loc` paths on the form fields (requirement 5.4).
 */
export function useSaveTemplate(store: DraftStore, api: SaveApi = DEFAULT_API): SaveState {
  const [status, setStatus] = useState<SaveStatus>('idle');
  const [errorKey, setErrorKey] = useState<string | null>(null);

  const persist = useCallback(
    async (publish: boolean): Promise<void> => {
      const { draft, draftId, dirty } = store.getState();
      let id = draftId;
      if (id === null) id = (await api.create(draft, publish)).id;
      else {
        if (dirty) await api.update(id, draft);
        if (publish) await api.publish(id);
      }
      // A published template is immutable: further edits start a new draft.
      store.markSaved(publish ? null : id);
      api.clearUnsaved();
      if (publish) {
        // The thumbnail is optional: a failure keeps the published template (the gallery draws a palette preview).
        const image = await api.renderThumbnail(draft).catch(() => null);
        if (image) await api.uploadThumbnail(id, image).catch(() => null);
      }
    },
    [store, api],
  );

  const run = useCallback(
    (publish: boolean) => {
      if (store.getState().errors.length > 0) return;
      setStatus(publish ? 'publishing' : 'saving');
      setErrorKey(null);
      persist(publish).then(
        () => setStatus(publish ? 'published' : 'saved'),
        (error: unknown) => {
          const code = error instanceof ApiError ? error.code : 'UNKNOWN';
          if (error instanceof ApiError && code === 'TEMPLATE_INVALID') {
            store.reject(error.details.map((d) => ({ path: pathFromLoc(d.loc), code: 'schema' as const })));
          }
          setErrorKey(code);
          setStatus('error');
        },
      );
    },
    [store, persist],
  );

  return { status, errorKey, save: useCallback(() => run(false), [run]), publish: useCallback(() => run(true), [run]) };
}
