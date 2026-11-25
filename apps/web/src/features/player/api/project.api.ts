import { AnalysisSchema, JobSchema, ProjectCreatedSchema, type Analysis, type Job } from '@/templates/generated';
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

/** `POST /api/projects/{id}/lyrics-search`: looks the lyrics up online, then transcribes the voice; returns the job id. */
export async function startLyricsSearch(
  projectId: string,
  query?: { artist: string; title: string },
): Promise<string> {
  const url = `/api/projects/${encodeURIComponent(projectId)}/lyrics-search`;
  const init: RequestInit = query
    ? { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(query) }
    : { method: 'POST' };
  const created = ProjectCreatedSchema.parse(await apiJson(url, init));
  if (created.jobId === null) throw new ApiError('UNKNOWN', 500);
  return created.jobId;
}

/** `GET /api/jobs/{id}`. */
export async function getJobStatus(jobId: string): Promise<Job> {
  const response = await fetch(`/api/jobs/${encodeURIComponent(jobId)}`, { cache: 'no-store' }).catch(() => {
    throw new ApiError('NETWORK', 0);
  });
  if (!response.ok) throw await apiErrorFrom(response);
  return JobSchema.parse(await response.json());
}
