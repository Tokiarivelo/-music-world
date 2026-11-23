'use client';

import { useMemo } from 'react';
import type { Analysis } from '@/templates/generated';
import { WorldView } from '@/features/world-view';
import { DEFAULT_TEMPLATE } from '@/templates/default';
import { loadProjectAudio } from '../api/project.api';
import { PLAYER_ERRORS, PLAYER_TEXT } from '../consts/player.consts';
import { useProjectAnalysis } from '../hooks/use-project-analysis';
import { useSongPlayer } from '../hooks/use-song-player';
import { seedFromHash } from '../lib/seed';
import { PlayerBar } from './PlayerBar';

function ProjectWorld({ projectId, analysis }: { projectId: string; analysis: Analysis }) {
  const deps = useMemo(
    () => ({ createContext: () => new AudioContext(), loadBuffer: () => loadProjectAudio(projectId) }),
    [projectId],
  );
  const player = useSongPlayer(deps);
  const scene = useMemo(
    () => ({ analysis, template: DEFAULT_TEMPLATE, seed: seedFromHash(analysis.audioHash), clock: player.clock }),
    [analysis, player.clock],
  );
  return (
    <div className="relative h-dvh w-full">
      <WorldView scene={scene} />
      {/* IWSDK sizes its canvas to the window, so the controls float above it. */}
      <div className="absolute inset-x-0 bottom-0 z-10 bg-gradient-to-t from-[var(--mw-bg)] to-transparent pt-6">
        <PlayerBar player={player} />
        <p className="pb-2 text-center text-xs opacity-60">
          {analysis.key} · {Math.round(analysis.tempoBpm)} BPM · {analysis.notes.length} notes
        </p>
      </div>
    </div>
  );
}

/** `/play/<projectId>`: an uploaded song's analysis and audio, rendered with the default template. */
export function ProjectPlayback({ projectId }: { projectId: string }) {
  const state = useProjectAnalysis(projectId);
  if (state.kind === 'ready') return <ProjectWorld projectId={projectId} analysis={state.analysis} />;
  return (
    <div className="flex h-dvh items-center justify-center p-6 text-center">
      {state.kind === 'loading' ? (
        <p role="status">{PLAYER_TEXT.loadingProject}</p>
      ) : (
        <p role="alert" className="text-[var(--mw-accent)]">
          {PLAYER_ERRORS[state.messageKey] ?? PLAYER_ERRORS.UNKNOWN}
        </p>
      )}
    </div>
  );
}
