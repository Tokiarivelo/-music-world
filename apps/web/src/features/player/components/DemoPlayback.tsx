'use client';

import { useMemo } from 'react';
import { DirectorPanel, useDirector, type DirectorSource } from '@/features/director';
import { useStoreTemplates } from '@/features/template-store';
import { WorldView } from '@/features/world-view';
import { loadAudioUrl } from '../api/project.api';
import { DEMO_SEED, PLAYER_TEXT } from '../consts/player.consts';
import { DEMO_SONG } from '../demo/demo-song';
import { useSongPlayer, type SongPlayerDeps } from '../hooks/use-song-player';
import { useAiTemplateChoice } from '../hooks/use-ai-template-choice';
import { useWorldControls } from '../hooks/use-world-controls';
import { synthesizeSong } from '../lib/synth-song';
import { PlayerBar } from './PlayerBar';
import { TemplateActions } from './TemplateActions';

const { analysis } = DEMO_SONG;
const DEMO_SOURCE: DirectorSource = { kind: 'demo', analysis };

const DEMO_DEPS: SongPlayerDeps = {
  createContext: () => new AudioContext(),
  // The demo must never break: if the MP3 cannot be loaded, play the analysed notes synthesized in the browser.
  loadBuffer: () => loadAudioUrl(DEMO_SONG.audioUrl).catch(() => synthesizeSong(analysis.notes, analysis.durationSec)),
};

/** `/play/demo`: the pre-analysed demo song and its audio, rendered with the default, a store or an AI-generated template
 * (`?template=<store id>` selects a store template). */
export function DemoPlayback({ storeTemplateId = null }: { storeTemplateId?: string | null }) {
  const player = useSongPlayer(DEMO_DEPS);
  const director = useDirector(DEMO_SOURCE);
  const store = useStoreTemplates(storeTemplateId);
  const choice = useAiTemplateChoice(director, store);
  const controls = useWorldControls(player, DEMO_SONG.title, choice);
  const { clock } = player;
  const { template } = choice;
  const scene = useMemo(() => ({ analysis, template, seed: DEMO_SEED, clock }), [template, clock]);
  return (
    <div className="relative h-dvh w-full">
      <WorldView controls={controls} scene={scene} />
      <div className="absolute left-3 top-3 z-10 max-w-[calc(100%-11rem)] sm:max-w-none">
        <DirectorPanel director={director} template={template} />
        <div className="mt-2 rounded-lg bg-[var(--mw-bg)]/80 px-3 py-2 empty:hidden">
          <TemplateActions template={template} generatedHere={director.templates.includes(template)} />
        </div>
      </div>
      {/* IWSDK sizes its canvas to the window, so the controls float above it. */}
      <div className="absolute inset-x-0 bottom-0 z-10 bg-gradient-to-t from-[var(--mw-bg)] to-transparent pt-6">
        <PlayerBar player={player} />
        <p className="pb-2 text-center text-xs opacity-60">
          {PLAYER_TEXT.demoNote(DEMO_SONG.title)} · {analysis.key} · {Math.round(analysis.tempoBpm)} BPM ·{' '}
          {analysis.notes.length} notes
        </p>
      </div>
    </div>
  );
}
