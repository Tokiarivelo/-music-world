'use client';

import { useCallback, useEffect, useState } from 'react';
import type { Job, ProjectCreated } from '@/templates/generated';
import { ApiError } from '@/lib/api-error';
import { POLL_INTERVAL_MS } from '../consts/upload.consts';
import type { UploadPhase } from '../interfaces/upload.interfaces';

export interface UploadDeps {
  createProject(audio: File, lrc: File | null): Promise<ProjectCreated>;
  getJob(jobId: string): Promise<Job>;
  /** Called once the analysis is ready (navigates to the world). */
  onReady(projectId: string): void;
  pollMs?: number;
}

export interface Upload {
  phase: UploadPhase;
  job: Job | null;
  submit(audio: File, lrc: File | null): Promise<void>;
  fail(messageKey: string): void;
}

const errorKey = (error: unknown): string => (error instanceof ApiError ? error.code : 'UNKNOWN');

/** Upload → poll the analysis job (stage + progress) → `onReady` when done. Polling is UI-only (not the world). */
export function useUpload(deps: UploadDeps): Upload {
  const [phase, setPhase] = useState<UploadPhase>({ kind: 'idle' });
  const [job, setJob] = useState<Job | null>(null);
  const { createProject, getJob, onReady, pollMs = POLL_INTERVAL_MS } = deps;

  const submit = useCallback(
    async (audio: File, lrc: File | null) => {
      setPhase({ kind: 'uploading' });
      setJob(null);
      try {
        const created = await createProject(audio, lrc);
        if (created.jobId === null || created.status === 'ready') {
          setPhase({ kind: 'ready', projectId: created.projectId });
        } else {
          setPhase({ kind: 'analysing', projectId: created.projectId, jobId: created.jobId });
        }
      } catch (error) {
        setPhase({ kind: 'error', messageKey: errorKey(error) });
      }
    },
    [createProject],
  );

  useEffect(() => {
    if (phase.kind !== 'analysing') return;
    let cancelled = false;
    let timer: ReturnType<typeof setTimeout> | undefined;
    const poll = async (): Promise<void> => {
      try {
        const current = await getJob(phase.jobId);
        if (cancelled) return;
        setJob(current);
        if (current.status === 'done') setPhase({ kind: 'ready', projectId: phase.projectId });
        else if (current.status === 'failed') setPhase({ kind: 'error', messageKey: current.error ?? 'UNKNOWN' });
        else timer = setTimeout(() => void poll(), pollMs);
      } catch (error) {
        if (!cancelled) setPhase({ kind: 'error', messageKey: errorKey(error) });
      }
    };
    void poll();
    return () => {
      cancelled = true;
      if (timer) clearTimeout(timer);
    };
  }, [phase, getJob, pollMs]);

  useEffect(() => {
    if (phase.kind === 'ready') onReady(phase.projectId);
  }, [phase, onReady]);

  const fail = useCallback((messageKey: string) => setPhase({ kind: 'error', messageKey }), []);
  return { phase, job, submit, fail };
}
