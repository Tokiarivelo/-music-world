import { AnalysisSchema, type Analysis } from '@/templates/generated';
import { ApiError, apiErrorFrom } from '@/lib/api-error';

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
