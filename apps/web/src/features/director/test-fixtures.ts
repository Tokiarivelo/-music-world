import type { DirectorProviders, DirectorResult } from '@/templates/generated';
import { NEON_NOCTURNE } from '@/templates/default';

export const PROVIDERS: DirectorProviders = {
  default: 'muse',
  providers: [
    { id: 'muse', model: 'muse-spark-1.3', configured: true },
    { id: 'bedrock', model: 'anthropic.claude-sonnet-5-5', configured: false },
    { id: 'mock', model: 'mock-director-1', configured: true },
  ],
};

export function result(provider: 'muse' | 'mock', id: string, requested: 'muse' | 'mock' = provider): DirectorResult {
  const model = provider === 'muse' ? 'muse-spark-1.3' : 'mock-director-1';
  return {
    template: {
      ...NEON_NOCTURNE,
      id,
      name: `World ${id}`,
      meta: { generatedBy: { provider, model, promptVersion: 'director-v1' } },
    },
    provider,
    model,
    requestedProvider: requested,
    cached: false,
    fallbacks: requested === provider ? [] : [{ provider: requested, reason: 'NOT_CONFIGURED' }],
  };
}
