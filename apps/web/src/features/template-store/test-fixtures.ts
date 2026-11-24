import type { StoreTemplate } from '@/templates/generated';
import { NEON_NOCTURNE } from '@/templates/default';

/** A valid store template for tests. */
export function stored(over: Partial<StoreTemplate> = {}): StoreTemplate {
  return {
    id: '0193a1b2-c3d4-7e5f-8a9b-0c1d2e3f4a5b',
    template: { ...NEON_NOCTURNE, id: 'neon-nocturne-2e3f4a5b' },
    status: 'published',
    author: { displayName: 'creator-abc123' },
    featured: false,
    thumbnailUrl: null,
    createdAt: '2026-11-26T10:00:00Z',
    publishedAt: '2026-11-26T10:00:00Z',
    ...over,
  };
}
