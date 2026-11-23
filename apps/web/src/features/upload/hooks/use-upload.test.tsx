import { act, renderHook, waitFor } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import type { Job, ProjectCreated } from '@/templates/generated';
import { ApiError } from '@/lib/api-error';
import { useUpload, type UploadDeps } from './use-upload';

const job = (status: Job['status'], stage: string | null, progress: number, error: string | null = null): Job => ({
  id: 'job-1',
  kind: 'analyze_project',
  status,
  stage,
  progress,
  error,
  createdAt: '2026-11-23T10:00:00Z',
  updatedAt: '2026-11-23T10:00:00Z',
});

function setup(created: ProjectCreated | Error, jobs: Job[]) {
  const onReady = vi.fn();
  const queue = [...jobs];
  const deps: UploadDeps = {
    createProject: vi.fn(async () => {
      if (created instanceof Error) throw created;
      return created;
    }),
    getJob: vi.fn(async () => queue.shift() ?? jobs[jobs.length - 1]!),
    onReady,
    pollMs: 1,
  };
  const hook = renderHook(() => useUpload(deps));
  return { hook, deps, onReady };
}

const FILE = new File(['x'], 'song.mp3', { type: 'audio/mpeg' });

describe('useUpload (requirement 1.3)', () => {
  it('polls the job through its stages and opens the world when done', async () => {
    const { hook, onReady } = setup({ projectId: 'p1', jobId: 'job-1', status: 'analyzing' }, [
      job('running', 'separate', 0.03),
      job('running', 'transcribe', 0.65),
      job('done', 'store', 1),
    ]);
    await act(() => hook.result.current.submit(FILE, null));
    await waitFor(() => expect(onReady).toHaveBeenCalledWith('p1'));
    expect(hook.result.current.phase).toEqual({ kind: 'ready', projectId: 'p1' });
    expect(hook.result.current.job?.progress).toBe(1);
  });

  it('opens a cached analysis immediately without polling', async () => {
    const { hook, deps, onReady } = setup({ projectId: 'p2', jobId: null, status: 'ready' }, []);
    await act(() => hook.result.current.submit(FILE, null));
    await waitFor(() => expect(onReady).toHaveBeenCalledWith('p2'));
    expect(deps.getJob).not.toHaveBeenCalled();
  });

  it('shows the API error code of a rejected upload or of a failed job', async () => {
    const rejected = setup(new ApiError('AUDIO_TOO_LONG', 422), []);
    await act(() => rejected.hook.result.current.submit(FILE, null));
    expect(rejected.hook.result.current.phase).toEqual({ kind: 'error', messageKey: 'AUDIO_TOO_LONG' });

    const failed = setup({ projectId: 'p3', jobId: 'job-1', status: 'analyzing' }, [
      job('failed', 'separate', 0.03, 'SEPARATION_FAILED'),
    ]);
    await act(() => failed.hook.result.current.submit(FILE, null));
    await waitFor(() =>
      expect(failed.hook.result.current.phase).toEqual({ kind: 'error', messageKey: 'SEPARATION_FAILED' }),
    );
    expect(failed.onReady).not.toHaveBeenCalled();
  });
});
