import { afterEach, describe, expect, it, vi } from 'vitest';
import { projectEditsRemote } from './project.api';

afterEach(() => vi.unstubAllGlobals());

const json = (status: number, body: unknown = {}) =>
  new Response(JSON.stringify(status >= 400 ? { error: { code: 'X', message: 'x', details: [] } } : body), {
    status,
    headers: { 'Content-Type': 'application/json' },
  });

describe('projectEditsRemote (I9)', () => {
  it('loads and saves through the edits endpoint', async () => {
    const fetchMock = vi.fn().mockResolvedValueOnce(json(200, { version: 1 })).mockResolvedValueOnce(json(200));
    vi.stubGlobal('fetch', fetchMock);
    const remote = projectEditsRemote('p 1');
    expect(await remote.load()).toEqual({ version: 1 });
    await remote.save({ version: 1, lines: [], notes: [], added: [] });
    expect(fetchMock.mock.calls[0]![0]).toBe('/api/projects/p%201/edits');
    expect(fetchMock.mock.calls[1]![1]).toMatchObject({ method: 'PUT' });
  });

  it('stops calling the server after a 401 (signed out)', async () => {
    const fetchMock = vi.fn().mockResolvedValue(json(401));
    vi.stubGlobal('fetch', fetchMock);
    const remote = projectEditsRemote('p');
    await expect(remote.load()).rejects.toBeTruthy();
    await remote.save({ version: 1, lines: [], notes: [], added: [] });
    await expect(remote.load()).rejects.toBeTruthy();
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });
});
