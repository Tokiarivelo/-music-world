import { afterEach, describe, expect, it, vi } from 'vitest';
import { DEMO_ANALYSIS } from '@/engine/__fixtures__/demo-analysis';
import { ApiError } from '@/lib/api-error';
import { PROVIDERS, result } from '../test-fixtures';
import { generateWorld, getDirectorProviders } from './director.api';

function mockFetch(status: number, body: unknown) {
  const fn = vi.fn(async () => new Response(JSON.stringify(body), { status }));
  vi.stubGlobal('fetch', fn);
  return fn;
}

afterEach(() => vi.unstubAllGlobals());

describe('director api', () => {
  it('parses the provider list', async () => {
    mockFetch(200, PROVIDERS);
    expect((await getDirectorProviders()).default).toBe('muse');
  });

  it('posts the provider for a project and validates the result', async () => {
    const fn = mockFetch(200, result('muse', 'ai-muse-1'));
    const out = await generateWorld({ kind: 'project', projectId: 'p/1' }, 'muse');
    expect(out.template.id).toBe('ai-muse-1');
    const [url, init] = fn.mock.calls[0] as unknown as [string, RequestInit];
    expect(url).toBe('/api/projects/p%2F1/director');
    expect(JSON.parse(String(init.body))).toEqual({ provider: 'muse' });
  });

  it('sends the demo analysis to the demo route', async () => {
    const fn = mockFetch(200, result('mock', 'ai-mock-1'));
    await generateWorld({ kind: 'demo', analysis: DEMO_ANALYSIS }, 'mock');
    const [url, init] = fn.mock.calls[0] as unknown as [string, RequestInit];
    expect(url).toBe('/api/director/demo');
    expect(JSON.parse(String(init.body)).analysis.audioHash).toBe(DEMO_ANALYSIS.audioHash);
  });

  it('rejects a result whose template is not valid data', async () => {
    const bad = result('muse', 'ai-muse-1');
    mockFetch(200, { ...bad, template: { ...bad.template, mappings: [{ when: {}, spawn: 'https://evil/x.glb' }] } });
    await expect(generateWorld({ kind: 'project', projectId: 'p' }, 'muse')).rejects.toThrow();
  });

  it('maps API errors to their code', async () => {
    mockFetch(429, { error: { code: 'RATE_LIMITED', message: 'x', details: [] } });
    await expect(generateWorld({ kind: 'project', projectId: 'p' }, 'muse')).rejects.toEqual(
      new ApiError('RATE_LIMITED', 429),
    );
  });
});
