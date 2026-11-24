"use client";

import { useEffect } from "react";
import type { NavigationState } from "@/xr/navigation/navigation-controller";
import {
  hasCommandModifier,
  isEditableTarget,
} from "@/xr/navigation/navigation-input";
import type { ViewPresetId } from "@/xr/navigation/orbit-camera";
import { PRESET_KEYS } from "../consts/world-view.consts";

export interface NavigationCommands {
  toggleExplore(): void;
  selectPreset(id: ViewPresetId): void;
  reset(): void;
}

/**
 * `N` toggles the explore mode, `R` resets the view, `1`–`4` select presets (08-navigation-mode requirement 3.2–3.3).
 * Ignored in text fields, with Ctrl / Alt / Meta, with auto-repeat, and while disabled (VR session).
 */
export function useNavigationShortcuts(
  commands: NavigationCommands | null,
  enabled: boolean,
): void {
  useEffect(() => {
    if (!commands || !enabled) return;
    const onKey = (e: KeyboardEvent): void => {
      if (e.repeat || hasCommandModifier(e) || isEditableTarget(e.target))
        return;
      if (e.code === "KeyN") commands.toggleExplore();
      else if (e.code === "KeyR") commands.reset();
      else if (e.code in PRESET_KEYS)
        commands.selectPreset(PRESET_KEYS[e.code as keyof typeof PRESET_KEYS]);
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [commands, enabled]);
}

export const INITIAL_NAVIGATION_STATE: NavigationState = {
  mode: "cinematic",
  preset: null,
};
