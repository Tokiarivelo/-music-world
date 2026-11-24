import { AnalysisSchema, type Analysis } from '@/templates/generated';
import { apiFetch, apiJson } from '@/lib/api-client';
import { ApiError, apiErrorFrom } from '@/lib/api-error';
import type { EditsRemote } from '@/features/world-view';

export const projectAudioUrl = (projectId: string): string => `/api/projects/${encodeURIComponent(projectId)}/audio`;

/** `GET /api/projects/{id}/analysis`, validated with the generated `music-world.analysis.v1` schema. */
export async function getProjectAnalysis(projectId: string): Promise<Analysis> {
  const response = await fetch(`/api/projects/${encodeURIComponent(projectId)}/analysis`).catch(() => {
    throw new ApiError('NETWORK', 0);
  });
  if (!response.ok) throw await apiErrorFrom(response);
  return AnalysisSchema.parse(await response.json());
}

/** Downloads and decodes a song (AudioBuffers can be played by any AudioContext). */
export async function loadAudioUrl(url: string): Promise<AudioBuffer> {
  const response = await fetch(url);
  if (!response.ok) throw await apiErrorFrom(response);
  const data = await response.arrayBuffer();
  return new OfflineAudioContext(1, 1, 44_100).decodeAudioData(data);
}

/** The uploaded song of a project. */
export const loadProjectAudio = (projectId: string): Promise<AudioBuffer> => loadAudioUrl(projectAudioUrl(projectId));

/**
 * The signed-in owner's note edits of a project (`GET` / `PUT /api/projects/{id}/edits`). A 401 or 404 (signed out, or
 * a project without an owner) switches the sync off for this page: the browser copy is used and no request is repeated.
 */
export function projectEditsRemote(projectId: string): EditsRemote {
  const url = `/api/projects/${encodeURIComponent(projectId)}/edits`;
  let off = false;
  const guard = (error: unknown): never => {
    if (error instanceof ApiError && (error.status === 401 || error.status === 404)) off = true;
    throw error;
  };
  return {
    load: () => (off ? Promise.reject(new ApiError('NOT_SIGNED_IN', 401)) : apiJson(url).catch(guard)),
    save: async (edits) => {
      if (off) return;
      await apiFetch(url, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(edits),
      }).catch(guard);
    },
  };
}
