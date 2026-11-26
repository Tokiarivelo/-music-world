"use client";

import { useEffect, useState } from "react";
import { useT } from "@/i18n";
import type { WorldHandle } from "@/xr/world-host";
import { ExploreIcon, PegmanIcon, ResetIcon } from "./NavIcons";
import { WALK_MAP_ID, WalkMap } from "./WalkMap";
import type { NavigationState } from "@/xr/navigation/navigation-controller";
import { VIEW_PRESET_IDS } from "@/xr/navigation/orbit-camera";
import type { NavigationCommands } from "../hooks/use-navigation-shortcuts";

interface NavigationControlsProps {
  state: NavigationState;
  commands: NavigationCommands;
  handle?: WorldHandle | null;
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
  handle,
}: NavigationControlsProps) {
  const t = useT("world");
  const exploring = state.mode === "explore";
  const walking = state.mode === "walk";
  const [drag, setDrag] = useState<{ x: number; y: number } | null>(null);

  // Pegman: drag the little person onto the map to stand there (the map opens as soon as the drag starts).
  useEffect(() => {
    if (!drag || !handle) return;
    const move = (e: PointerEvent): void =>
      setDrag({ x: e.clientX, y: e.clientY });
    const up = (e: PointerEvent): void => {
      const map = handle.walkMap();
      const el = document.getElementById(WALK_MAP_ID);
      if (map && el) {
        const r = el.getBoundingClientRect();
        if (
          e.clientX >= r.left &&
          e.clientX <= r.right &&
          e.clientY >= r.top &&
          e.clientY <= r.bottom
        ) {
          const u = ((e.clientX - r.left) / r.width - 0.5) * 2;
          const v = ((e.clientY - r.top) / r.height - 0.5) * 2;
          handle.placeWalker(map.cx + u * map.limit, map.cz + v * map.limit);
        }
      }
      setDrag(null);
    };
    window.addEventListener("pointermove", move);
    window.addEventListener("pointerup", up);
    window.addEventListener("pointercancel", up);
    return () => {
      window.removeEventListener("pointermove", move);
      window.removeEventListener("pointerup", up);
      window.removeEventListener("pointercancel", up);
    };
  }, [drag !== null, handle]); // eslint-disable-line react-hooks/exhaustive-deps

  return (
    <>
      {walking && handle && (
        <WalkMap dragging={drag !== null} handle={handle} />
      )}
      {drag && (
        <div
          className="pointer-events-none fixed z-30 -translate-x-1/2 -translate-y-full text-[var(--mw-accent)] drop-shadow-lg"
          style={{ left: drag.x, top: drag.y }}
        >
          <PegmanIcon className="h-10 w-10" />
        </div>
      )}
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
            <ExploreIcon className="mr-1.5 inline h-4 w-4 align-[-2px]" />
            {t("nav.explore")}
          </button>
          <button
            aria-pressed={walking}
            className={`${BUTTON} ${walking ? ACTIVE : IDLE}`}
            onClick={commands.toggleWalk}
            type="button"
          >
            <PegmanIcon className="mr-1.5 inline h-4 w-4 align-[-2px]" />
            {t("nav.walk")}
          </button>
          <button
            aria-label={t("nav.pegman")}
            className={`${BUTTON} ${IDLE} cursor-grab touch-none px-3 active:cursor-grabbing`}
            onPointerDown={(e) => {
              e.preventDefault();
              if (!walking) commands.toggleWalk();
              setDrag({ x: e.clientX, y: e.clientY });
            }}
            title={t("nav.pegmanHint")}
            type="button"
          >
            <PegmanIcon className="h-4 w-4 text-[var(--mw-accent)]" />
          </button>
          {walking && (
            <button
              className={`${BUTTON} ${IDLE}`}
              onClick={commands.reset}
              type="button"
            >
              <ResetIcon className="mr-1.5 inline h-4 w-4 align-[-2px]" />
              {t("nav.walkReset")}
            </button>
          )}
          {exploring && (
            <>
              <div
                aria-label={t("nav.presetsLabel")}
                className="flex flex-wrap justify-end gap-2"
                role="group"
              >
                {VIEW_PRESET_IDS.map((id, i) => (
                  <button
                    aria-pressed={state.preset === id}
                    className={`${BUTTON} ${state.preset === id ? ACTIVE : IDLE}`}
                    key={id}
                    title={`${i + 1}`}
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
                <ResetIcon className="mr-1.5 inline h-4 w-4 align-[-2px]" />
                {t("nav.reset")}
              </button>
            </>
          )}
        </div>
        {(exploring || walking) && (
          <p className="max-w-xs text-right text-xs text-white/70">
            {walking ? t("nav.walkHint") : t("nav.hint")}
          </p>
        )}
      </div>
    </>
  );
}
