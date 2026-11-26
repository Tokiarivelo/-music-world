"use client";

import { useEffect, useRef, useState } from "react";
import { useT } from "@/i18n";
import type { WorldHandle } from "@/xr/world-host";
import { WALK_MAP_ID, WalkMap, mapPoint } from "./WalkMap";
import { ExploreIcon, PegmanIcon, ResetIcon } from "./NavIcons";
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
  const pressed = useRef<{ x: number; y: number } | null>(null);
  const suppressClick = useRef(false);
  const [drag, setDrag] = useState<{ x: number; y: number } | null>(null);

  // The Walk button is also the pegman: a click toggles the mode, a press and move (> 6 px) starts a drag, and the
  // walk mode only starts at the drop, so a simple click is unchanged.
  useEffect(() => {
    const move = (e: PointerEvent): void => {
      const p = pressed.current;
      if (!p || Math.hypot(e.clientX - p.x, e.clientY - p.y) < 6) return;
      pressed.current = null;
      suppressClick.current = true;
      setDrag({ x: e.clientX, y: e.clientY });
    };
    const end = (): void => {
      pressed.current = null;
    };
    window.addEventListener("pointermove", move);
    window.addEventListener("pointerup", end);
    window.addEventListener("pointercancel", end);
    return () => {
      window.removeEventListener("pointermove", move);
      window.removeEventListener("pointerup", end);
      window.removeEventListener("pointercancel", end);
    };
  }, [handle]);

  // Pegman: drag the little person over the 3D world; the view only changes at the drop.
  useEffect(() => {
    if (!drag || !handle) return;
    const move = (e: PointerEvent): void =>
      setDrag({ x: e.clientX, y: e.clientY });
    const up = (e: PointerEvent): void => {
      // Dropped on the 3D view (not on a button or a panel): land there and start the walk mode.
      const over = document.elementFromPoint(e.clientX, e.clientY);
      if (over instanceof HTMLCanvasElement && over.id === WALK_MAP_ID) {
        const p = mapPoint(handle, over, e.clientX, e.clientY);
        if (p) handle.landAtMap(p.x, p.z);
      } else if (over instanceof HTMLCanvasElement)
        handle.landAt(e.clientX, e.clientY);
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
      {(walking || drag) && handle && (
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
            onClick={() => {
              if (suppressClick.current) suppressClick.current = false;
              else commands.toggleWalk();
            }}
            onPointerDown={(e) => {
              if (e.button !== 0) return;
              suppressClick.current = false;
              pressed.current = { x: e.clientX, y: e.clientY };
            }}
            title={t("nav.pegmanHint")}
            type="button"
          >
            <PegmanIcon className="mr-1.5 inline h-4 w-4 align-[-2px]" />
            {t("nav.walk")}
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
