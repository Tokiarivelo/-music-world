'use client';

import { useMemo } from 'react';
import { DEMO_ANALYSIS as demo } from '@/engine/__fixtures__/demo-analysis';
import { WorldView } from '@/features/world-view';
import { DEFAULT_TEMPLATE } from '@/templates/default';
import { DEMO_SEED, PLAYER_TEXT } from '../consts/player.consts';
import { useSongPlayer, type SongPlayerDeps } from '../hooks/use-song-player';
import { synthesizeSong } from '../lib/synth-song';
import { PlayerBar } from './PlayerBar';

const DEMO_DEPS: SongPlayerDeps = {
  createContext: () => new AudioContext(),
  loadBuffer: () => synthesizeSong(demo.notes, demo.durationSec),
};

/** `/play/demo`: the hand-made demo analysis, synthesized as audio, rendered with the default template. */
export function DemoPlayback() {
  const player = useSongPlayer(DEMO_DEPS);
  const scene = useMemo(
    () => ({ analysis: demo, template: DEFAULT_TEMPLATE, seed: DEMO_SEED, clock: player.clock }),
    [player.clock],
  );
  return (
    <div className="relative h-dvh w-full">
      <WorldView scene={scene} />
      {/* IWSDK sizes its canvas to the window, so the controls float above it. */}
      <div className="absolute inset-x-0 bottom-0 z-10 bg-gradient-to-t from-[var(--mw-bg)] to-transparent pt-6">
        <PlayerBar player={player} />
        <p className="pb-2 text-center text-xs opacity-60">{PLAYER_TEXT.synthNote}</p>
      </div>
    </div>
  );
}
