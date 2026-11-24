'use client';

import type { NavigationState } from '@/xr/navigation/navigation-controller';
import { VIEW_PRESET_IDS } from '@/xr/navigation/orbit-camera';
import { NAVIGATION_TEXT } from '../consts/world-view.consts';
import type { NavigationCommands } from '../hooks/use-navigation-shortcuts';

interface NavigationControlsProps {
  state: NavigationState;
  commands: NavigationCommands;
}

const BUTTON =
  'rounded-full border border-white/20 bg-black/50 px-4 py-2 text-sm text-white backdrop-blur ' +
  'focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--mw-accent)]';
const ACTIVE = 'bg-[var(--mw-accent)] text-black';

/** Explore toggle, presets, reset and hint, floating above the canvas (siblings: they never move the camera). */
export function NavigationControls({ state, commands }: NavigationControlsProps) {
  const exploring = state.mode === 'explore';
  return (
    <div aria-label={NAVIGATION_TEXT.group} className="absolute bottom-24 left-4 z-10 flex flex-col gap-2" role="group">
      <div className="flex flex-wrap gap-2">
        <button
          aria-pressed={exploring}
          className={`${BUTTON} ${exploring ? ACTIVE : ''}`}
          onClick={commands.toggleExplore}
          type="button"
        >
          {NAVIGATION_TEXT.explore}
        </button>
        {exploring && (
          <>
            <div aria-label={NAVIGATION_TEXT.presetsLabel} className="flex flex-wrap gap-2" role="group">
              {VIEW_PRESET_IDS.map((id) => (
                <button
                  aria-pressed={state.preset === id}
                  className={`${BUTTON} ${state.preset === id ? ACTIVE : ''}`}
                  key={id}
                  onClick={() => commands.selectPreset(id)}
                  type="button"
                >
                  {NAVIGATION_TEXT.presets[id]}
                </button>
              ))}
            </div>
            <button className={BUTTON} onClick={commands.reset} type="button">
              {NAVIGATION_TEXT.reset}
            </button>
          </>
        )}
      </div>
      {exploring && <p className="max-w-xs text-xs text-white/70">{NAVIGATION_TEXT.hint}</p>}
    </div>
  );
}
