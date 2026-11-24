'use client';

import { useCallback, useState } from 'react';
import type { StoreTemplate, Template } from '@/templates/generated';
import { ApiError } from '@/lib/api-error';
import { createStoreTemplate, uploadThumbnail } from '../api/template-store.api';
import { renderThumbnail } from '../lib/thumbnail';

export interface PublishApi {
  create(template: Template, publish: boolean): Promise<StoreTemplate>;
  uploadThumbnail(id: string, image: Blob): Promise<StoreTemplate>;
  renderThumbnail(template: Template): Promise<Blob | null>;
}

const DEFAULT_API: PublishApi = { create: createStoreTemplate, uploadThumbnail, renderThumbnail };

export type PublishStatus = 'idle' | 'publishing' | 'published' | 'error';

export interface PublishState {
  status: PublishStatus;
  errorKey: string | null;
  /** Ids of the player templates already published in this session (no double publication). */
  publishedIds: readonly string[];
  publish(template: Template): void;
}

/** Publishes a template (an AI-generated one keeps its `meta.generatedBy`), then attaches a generated thumbnail. */
export function usePublishTemplate(api: PublishApi = DEFAULT_API): PublishState {
  const [status, setStatus] = useState<PublishStatus>('idle');
  const [errorKey, setErrorKey] = useState<string | null>(null);
  const [publishedIds, setPublishedIds] = useState<readonly string[]>([]);
  const publish = useCallback(
    (template: Template) => {
      setStatus('publishing');
      setErrorKey(null);
      api
        .create(template, true)
        .then(async (stored) => {
          // The thumbnail is optional: a failure keeps the published template (the gallery draws a palette preview).
          const image = await api.renderThumbnail(template).catch(() => null);
          if (image) await api.uploadThumbnail(stored.id, image).catch(() => null);
          setPublishedIds((ids) => [...ids, template.id]);
          setStatus('published');
        })
        .catch((error: unknown) => {
          setErrorKey(error instanceof ApiError ? error.code : 'UNKNOWN');
          setStatus('error');
        });
    },
    [api],
  );
  return { status, errorKey, publishedIds, publish };
}
