import {
  DirectorProvidersSchema,
  DirectorResultSchema,
  LayoutResultSchema,
  type DirectorProviders,
  type DirectorResult,
  type LayoutResult,
  type Template,
} from '@/templates/generated';
import { apiJson } from '@/lib/api-client';
import type { DirectorSource, ProviderId } from '../interfaces/director.interfaces';

/** `GET /api/director/providers`, validated with `music-world.director-providers.v1`. */
export async function getDirectorProviders(): Promise<DirectorProviders> {
  return DirectorProvidersSchema.parse(await apiJson('/api/director/providers', { cache: 'no-store' }));
}

/** Generates a world template; the result (template included) is validated with `music-world.director-result.v1`. */
export async function generateWorld(source: DirectorSource, provider: ProviderId): Promise<DirectorResult> {
  const url =
    source.kind === 'project' ? `/api/projects/${encodeURIComponent(source.projectId)}/director` : '/api/director/demo';
  const body = source.kind === 'project' ? { provider } : { provider, analysis: source.analysis };
  const init = { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify(body) };
  return DirectorResultSchema.parse(await apiJson(url, init));
}

/** The director writes where each object of the chosen template grows (a project's song, or the shipped demo song). */
export async function directLayout(source: DirectorSource, template: Template, provider?: ProviderId): Promise<LayoutResult> {
  const url =
    source.kind === 'project' ? `/api/projects/${encodeURIComponent(source.projectId)}/layout` : '/api/director/layout/demo';
  const body = { template, ...(provider ? { provider } : {}), ...(source.kind === 'demo' ? { analysis: source.analysis } : {}) };
  const init = { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify(body) };
  return LayoutResultSchema.parse(await apiJson(url, init));
}
