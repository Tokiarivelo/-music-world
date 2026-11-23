'use client';

import { useEffect, useState } from 'react';
import type { Analysis } from '@/templates/generated';
import { ApiError } from '@/lib/api-error';
import { getProjectAnalysis } from '../api/project.api';

export type ProjectAnalysisState =
  | { readonly kind: 'loading' }
  | { readonly kind: 'ready'; readonly analysis: Analysis }
  | { readonly kind: 'error'; readonly messageKey: string };

type Loaded = { readonly projectId: string; readonly state: ProjectAnalysisState };

/** Loads a project's analysis; reports `loading` until the result for the current `projectId` arrives. */
export function useProjectAnalysis(
  projectId: string,
  load: (projectId: string) => Promise<Analysis> = getProjectAnalysis,
): ProjectAnalysisState {
  const [loaded, setLoaded] = useState<Loaded | null>(null);
  useEffect(() => {
    let cancelled = false;
    load(projectId)
      .then((analysis) => {
        if (!cancelled) setLoaded({ projectId, state: { kind: 'ready', analysis } });
      })
      .catch((error: unknown) => {
        const messageKey = error instanceof ApiError ? error.code : 'UNKNOWN';
        if (!cancelled) setLoaded({ projectId, state: { kind: 'error', messageKey } });
      });
    return () => {
      cancelled = true;
    };
  }, [projectId, load]);
  return loaded?.projectId === projectId ? loaded.state : { kind: 'loading' };
}
