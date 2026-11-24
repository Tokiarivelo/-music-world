import { JobSchema, ProjectCreatedSchema, type Job, type ProjectCreated } from '@/templates/generated';
import { ApiError, apiErrorFrom } from '@/lib/api-error';
import { apiJson } from '@/lib/api-client';

/** `POST /api/projects` (multipart): starts the analysis, or reuses a cached one. */
export async function createProject(audio: File, lrc: File | null): Promise<ProjectCreated> {
  const body = new FormData();
  body.append('audio', audio);
  if (lrc) body.append('lyrics', lrc);
  return ProjectCreatedSchema.parse(await apiJson('/api/projects', { method: 'POST', body }));
}

/** `GET /api/jobs/{id}`: status, stage and progress of the analysis job. */
export async function getJob(jobId: string): Promise<Job> {
  const response = await fetch(`/api/jobs/${encodeURIComponent(jobId)}`, { cache: 'no-store' }).catch(() => {
    throw new ApiError('NETWORK', 0);
  });
  if (!response.ok) throw await apiErrorFrom(response);
  return JobSchema.parse(await response.json());
}
