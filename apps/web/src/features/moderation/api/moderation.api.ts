import { z } from 'zod';
import { ModerationQueueSchema, type ModerationQueue } from '@/templates/generated';
import { apiFetch, apiJson } from '@/lib/api-client';
import type { Decision } from '../consts/moderation.consts';

export type QueueItem = ModerationQueue['items'][number];
export interface QueuePage {
  items: QueueItem[];
  nextCursor: string | null;
}

/** The envelope only: an item that does not parse is skipped, never rendered. */
const LooseQueueSchema = z.object({ items: z.array(z.unknown()), nextCursor: z.string().nullable() });
const ItemSchema = ModerationQueueSchema.shape.items.element;

/** `GET /api/moderation/templates` (moderators only: 404 for everyone else). */
export async function listQueue(cursor: string | null = null, limit?: number): Promise<QueuePage> {
  const params = new URLSearchParams();
  if (cursor) params.set('cursor', cursor);
  if (limit) params.set('limit', String(limit));
  const query = params.size > 0 ? `?${params.toString()}` : '';
  const page = LooseQueueSchema.parse(await apiJson(`/api/moderation/templates${query}`, { cache: 'no-store' }));
  const items: QueueItem[] = [];
  for (const raw of page.items) {
    const parsed = ItemSchema.safeParse(raw);
    if (parsed.success) items.push(parsed.data);
  }
  return { items, nextCursor: page.nextCursor };
}

/** `POST /api/moderation/templates/{id}/restore|remove`: 204, 409 when the template is not hidden any more. */
export async function decide(storeId: string, decision: Decision): Promise<void> {
  await apiFetch(`/api/moderation/templates/${encodeURIComponent(storeId)}/${decision}`, { method: 'POST' });
}
