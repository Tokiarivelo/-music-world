import { renderHook, waitFor } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import { DEMO_ANALYSIS } from '@/engine/__fixtures__/demo-analysis';
import { ApiError } from '@/lib/api-error';
import { useProjectAnalysis } from './use-project-analysis';

describe('useProjectAnalysis', () => {
  it('goes from loading to ready', async () => {
    const load = async () => DEMO_ANALYSIS;
    const hook = renderHook(() => useProjectAnalysis('p1', load));
    expect(hook.result.current.kind).toBe('loading');
    await waitFor(() => expect(hook.result.current).toEqual({ kind: 'ready', analysis: DEMO_ANALYSIS }));
  });

  it('reports the API error code', async () => {
    const load = async () => {
      throw new ApiError('ANALYSIS_NOT_READY', 409);
    };
    const hook = renderHook(() => useProjectAnalysis('p1', load));
    await waitFor(() => expect(hook.result.current).toEqual({ kind: 'error', messageKey: 'ANALYSIS_NOT_READY' }));
  });
});
