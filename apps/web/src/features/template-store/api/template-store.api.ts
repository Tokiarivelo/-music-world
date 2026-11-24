import { z } from 'zod';
import { StoreTemplateSchema, type StoreTemplate, type Template } from '@/templates/generated';
import { apiFetch, apiJson } from '@/lib/api-client';
import type { ReportReason } from '../consts/template-store.consts';

export interface StorePage {
  items: StoreTemplate[];
  nextCursor: string | null;
}

/** The page envelope only: each item is validated on its own, so one invalid template never hides the others. */
const LoosePageSchema = z.object({ items: z.array(z.unknown()), nextCursor: z.string().nullable() });

function parsePage(body: unknown): StorePage {
  const page = LoosePageSchema.parse(body);
  const items: StoreTemplate[] = [];
  for (const item of page.items) {
    const parsed = StoreTemplateSchema.safeParse(item);
    if (parsed.success) items.push(parsed.data); // invalid templates are skipped, never rendered (requirement 4.5)
  }
  return { items, nextCursor: page.nextCursor };
}

/** `GET /api/templates`: published templates, newest first, launch templates first. */
export async function listStoreTemplates(cursor: string | null = null, limit?: number): Promise<StorePage> {
  const params = new URLSearchParams();
  if (cursor) params.set('cursor', cursor);
  if (limit) params.set('limit', String(limit));
  const query = params.size > 0 ? `?${params.toString()}` : '';
  return parsePage(await apiJson(`/api/templates${query}`, { cache: 'no-store' }));
}

/** `GET /api/templates/mine` (signed in): the caller's drafts, published and hidden templates. */
export async function listMyTemplates(): Promise<StoreTemplate[]> {
  return parsePage(await apiJson('/api/templates/mine', { cache: 'no-store' })).items;
}

/** `GET /api/templates/{id}`. */
export async function getStoreTemplate(id: string): Promise<StoreTemplate> {
  return StoreTemplateSchema.parse(await apiJson(`/api/templates/${encodeURIComponent(id)}`, { cache: 'no-store' }));
}

/** `POST /api/templates` (signed in): validated again by the server against `music-world.template.v1`. */
export async function createStoreTemplate(template: Template, publish: boolean): Promise<StoreTemplate> {
  const init = {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ template, publish }),
  };
  return StoreTemplateSchema.parse(await apiJson('/api/templates', init));
}

/** `PUT /api/templates/{id}` (owner, draft only): replaces the document of a saved draft. */
export async function updateStoreTemplate(id: string, template: Template): Promise<StoreTemplate> {
  const init = { method: 'PUT', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ template }) };
  return StoreTemplateSchema.parse(await apiJson(`/api/templates/${encodeURIComponent(id)}`, init));
}

/** `POST /api/templates/{id}/publish` (owner): publishes a saved draft. */
export async function publishStoreTemplate(id: string): Promise<StoreTemplate> {
  return StoreTemplateSchema.parse(await apiJson(`/api/templates/${encodeURIComponent(id)}/publish`, { method: 'POST' }));
}

/** `POST /api/templates/{id}/reports` (signed in): one report per user and template. */
export async function reportStoreTemplate(id: string, reason: ReportReason): Promise<void> {
  const init = { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ reason }) };
  await apiFetch(`/api/templates/${encodeURIComponent(id)}/reports`, init);
}

/** `PUT /api/templates/{id}/thumbnail` (owner): PNG, JPEG or WebP, ≤ 128 KB. */
export async function uploadThumbnail(id: string, image: Blob): Promise<StoreTemplate> {
  const body = new FormData();
  body.append('image', image, 'thumbnail');
  const init = { method: 'PUT', body };
  return StoreTemplateSchema.parse(await apiJson(`/api/templates/${encodeURIComponent(id)}/thumbnail`, init));
}
