'use client';

import { useMemo } from 'react';
import type { Analysis } from '@/templates/generated';
import { DirectorPanel, useDirector, type DirectorSource } from '@/features/director';
import { WorldView } from '@/features/world-view';
import { loadProjectAudio } from '../api/project.api';
import { PLAYER_ERRORS, PLAYER_TEXT } from '../consts/player.consts';
import { useProjectAnalysis } from '../hooks/use-project-analysis';
import { useSongPlayer } from '../hooks/use-song-player';
import { useAiTemplateChoice } from '../hooks/use-ai-template-choice';
import { useWorldControls } from '../hooks/use-world-controls';
import { seedFromHash } from '../lib/seed';
import { PlayerBar } from './PlayerBar';
import { TemplateActions } from './TemplateActions';

function ProjectWorld({ projectId, analysis }: { projectId: string; analysis: Analysis }) {
  const deps = useMemo(
    () => ({ createContext: () => new AudioContext(), loadBuffer: () => loadProjectAudio(projectId) }),
    [projectId],
  );
  const player = useSongPlayer(deps);
  const source = useMemo<DirectorSource>(() => ({ kind: 'project', projectId }), [projectId]);
  const director = useDirector(source);
  const choice = useAiTemplateChoice(director);
  const controls = useWorldControls(player, PLAYER_TEXT.projectTitle, choice);
  const { clock } = player;
  const { template } = choice;
  const scene = useMemo(
    () => ({ analysis, template, seed: seedFromHash(analysis.audioHash), clock }),
    [analysis, template, clock],
  );
  return (
    <div className="relative h-dvh w-full">
      <WorldView controls={controls} scene={scene} />
      <div className="absolute left-3 top-3 z-10 max-w-[calc(100%-11rem)] sm:max-w-none">
        <DirectorPanel director={director} template={template} />
        <div className="mt-2 rounded-lg bg-[var(--mw-bg)]/80 px-3 py-2 empty:hidden">
          <TemplateActions template={template} />
        </div>
      </div>
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

/** `/play/<projectId>`: an uploaded song's analysis and audio, rendered with the default template or an AI-generated one. */
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
