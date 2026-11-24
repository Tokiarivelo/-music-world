import { afterEach, describe, expect, it, vi } from 'vitest';
import { listStoreTemplates } from './template-store.api';
import { stored } from '../test-fixtures';

afterEach(() => vi.unstubAllGlobals());

describe('template store api', () => {
  it('drops invalid templates instead of failing the whole page', async () => {
    const bad = { ...stored({ id: 'bad' }), template: { ...stored().template, palette: { background: 'red' } } };
    const body = { items: [stored(), bad, { not: 'a template' }], nextCursor: 'abc' };
    const fetchMock = vi.fn(async () => Response.json(body));
    vi.stubGlobal('fetch', fetchMock);
    const page = await listStoreTemplates(null, 12);
    expect(page.items.map((t) => t.id)).toEqual([stored().id]);
    expect(page.nextCursor).toBe('abc');
    expect((fetchMock.mock.calls as unknown as [string][])[0]![0]).toBe('/api/templates?limit=12');
  });
});
