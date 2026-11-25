'use client';

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import type { Analysis } from '@/templates/generated';
import type { LyricsSearch } from '@/features/world-view';
import { getJobStatus, getProjectAnalysis, startLyricsSearch } from '../api/project.api';

export const POLL_MS = 2000;
const MAX_POLLS = 300; // 10 minutes: a long song on a slow CPU
/** Vocal notes needed to say the song has a singing voice (the analysis keeps the stem of each note). */
export const MIN_VOCAL_NOTES = 8;

export function hasVoice(analysis: Analysis): boolean {
  let count = 0;
  for (const note of analysis.notes) {
    if (note.stem === 'vocals' && ++count >= MIN_VOCAL_NOTES) return true;
  }
  return false;
}

/**
 * "Search lyrics" for a project without lyrics: starts the background job, follows it, then reloads the analysis so the
 * lyrics are mapped to the song. `onFound` receives the updated analysis.
 */
export function useLyricsSearch(
  projectId: string,
  analysis: Analysis,
  onFound: (next: Analysis) => void,
): LyricsSearch {
  const [status, setStatus] = useState<LyricsSearch['status']>('idle');
  const alive = useRef(true);
  const onFoundRef = useRef(onFound);
  useEffect(() => {
    onFoundRef.current = onFound;
  }, [onFound]);
  useEffect(() => {
    alive.current = true;
    return () => {
      alive.current = false;
    };
  }, []);

  const start = useCallback<LyricsSearch['start']>((query) => {
    if (status === 'searching') return;
    setStatus('searching');
    void (async () => {
      try {
        const jobId = await (query ? startLyricsSearch(projectId, query) : startLyricsSearch(projectId));
        for (let i = 0; i < MAX_POLLS && alive.current; i++) {
          await new Promise((resolve) => setTimeout(resolve, POLL_MS));
          const job = await getJobStatus(jobId);
          if (job.status === 'failed') throw new Error('job failed');
          if (job.status !== 'done') continue;
          const next = await getProjectAnalysis(projectId);
          if (!alive.current) return;
          if (next.lyrics.length > 0) onFoundRef.current(next);
          setStatus(next.lyrics.length > 0 ? 'idle' : 'notFound');
          return;
        }
        if (alive.current) setStatus('failed');
      } catch {
        if (alive.current) setStatus('failed');
      }
    })();
  }, [projectId, status]);

  const voice = useMemo(() => hasVoice(analysis), [analysis]);
  return useMemo(() => ({ voice, status, start }), [voice, status, start]);
}
