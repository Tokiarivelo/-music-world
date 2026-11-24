import {
  DirectorProvidersSchema,
  DirectorResultSchema,
  type DirectorProviders,
  type DirectorResult,
} from '@/templates/generated';
import { ApiError, apiErrorFrom } from '@/lib/api-error';
import type { DirectorSource, ProviderId } from '../interfaces/director.interfaces';

async function send(url: string, init?: RequestInit): Promise<unknown> {
  const response = await fetch(url, init).catch(() => {
    throw new ApiError('NETWORK', 0);
  });
  if (!response.ok) throw await apiErrorFrom(response);
  return response.json();
}

/** `GET /api/director/providers`, validated with `music-world.director-providers.v1`. */
export async function getDirectorProviders(): Promise<DirectorProviders> {
  return DirectorProvidersSchema.parse(await send('/api/director/providers', { cache: 'no-store' }));
}

/** Generates a world template; the result (template included) is validated with `music-world.director-result.v1`. */
export async function generateWorld(source: DirectorSource, provider: ProviderId): Promise<DirectorResult> {
  const url =
    source.kind === 'project' ? `/api/projects/${encodeURIComponent(source.projectId)}/director` : '/api/director/demo';
  const body = source.kind === 'project' ? { provider } : { provider, analysis: source.analysis };
  const init = { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify(body) };
  return DirectorResultSchema.parse(await send(url, init));
}
