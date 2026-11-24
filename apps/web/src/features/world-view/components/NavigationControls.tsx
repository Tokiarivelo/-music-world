"use client";

import { useT } from "@/i18n";
import type { NavigationState } from "@/xr/navigation/navigation-controller";
import { VIEW_PRESET_IDS } from "@/xr/navigation/orbit-camera";
import type { NavigationCommands } from "../hooks/use-navigation-shortcuts";

interface NavigationControlsProps {
  state: NavigationState;
  commands: NavigationCommands;
}

const BUTTON =
  "rounded-full border border-white/20 px-4 py-2 text-sm backdrop-blur " +
  "focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--mw-accent)]";
const IDLE = "bg-black/50 text-white";
const ACTIVE = "bg-[var(--mw-accent)] text-black";

/** Explore toggle, presets, reset and hint, floating above the canvas (siblings: they never move the camera). */
export function NavigationControls({
  state,
  commands,
}: NavigationControlsProps) {
  const t = useT("world");
  const exploring = state.mode === "explore";
  return (
    <div
      aria-label={t("nav.group")}
      className="absolute right-4 top-20 z-10 flex max-w-[calc(100%-2rem)] flex-col items-end gap-2"
      role="group"
    >
      <div className="flex flex-wrap justify-end gap-2">
        <button
          aria-pressed={exploring}
          className={`${BUTTON} ${exploring ? ACTIVE : IDLE}`}
          onClick={commands.toggleExplore}
          type="button"
        >
          {t("nav.explore")}
        </button>
        {exploring && (
          <>
            <div
              aria-label={t("nav.presetsLabel")}
              className="flex flex-wrap justify-end gap-2"
              role="group"
            >
              {VIEW_PRESET_IDS.map((id) => (
                <button
                  aria-pressed={state.preset === id}
                  className={`${BUTTON} ${state.preset === id ? ACTIVE : IDLE}`}
                  key={id}
                  onClick={() => commands.selectPreset(id)}
                  type="button"
                >
                  {t(`preset.${id}`)}
                </button>
              ))}
            </div>
            <button
              className={`${BUTTON} ${IDLE}`}
              onClick={commands.reset}
              type="button"
            >
              {t("nav.reset")}
            </button>
          </>
        )}
      </div>
      {exploring && (
        <p className="max-w-xs text-right text-xs text-white/70">
          {t("nav.hint")}
        </p>
      )}
    </div>
  );
}
