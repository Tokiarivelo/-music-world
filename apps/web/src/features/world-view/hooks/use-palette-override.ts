import { useEffect, useSyncExternalStore } from "react";
import type { WorldHandle, WorldScene } from "@/xr/world-host";
import { effectiveLightLevel, effectiveOverride, getPaletteStore, type PaletteStore } from "../lib/palette-store";

const NOOP = () => () => undefined;
const SERVER_STATE = { seed: null, override: null, locked: [], brightness: 0, contrast: 0 } as const;

/** The shared color store of the scene's template (null before there is a scene). */
export function usePaletteStore(scene: WorldScene | undefined): PaletteStore | null {
  const template = scene?.template;
  return template ? getPaletteStore(template.id, template.palette) : null;
}

/**
 * Keeps the world colored with the listener's choice (I4): a change reaches the world as a view override, applied
 * after `load` so a new song or template never loses it.
 */
export function usePaletteOverride(handle: WorldHandle | null, scene: WorldScene | undefined): void {
  const store = usePaletteStore(scene);
  const state = useSyncExternalStore(
    store ? store.subscribe : NOOP,
    store ? store.getState : () => SERVER_STATE,
    () => SERVER_STATE,
  );
  useEffect(() => {
    if (handle && scene) handle.setPaletteOverride(effectiveOverride(scene.template.palette, state));
  }, [handle, scene, state]);
  const lightLevel = effectiveLightLevel(state);
  useEffect(() => {
    handle?.setLightLevel(lightLevel);
  }, [handle, lightLevel]);
}
