"use client";

import { useCallback, useEffect, useState } from "react";
import type { HiddenLayers } from "@/engine/layers";
import type { WorldHandle } from "@/xr/world-host";
import { layerStore } from "@/xr/layer-store";
import { loadHiddenLayers, saveHiddenLayers } from "../lib/layers-storage";

/** Hidden layers of the viewer: remembered per browser, pushed to the world whenever it exists or they change. */
export function useHiddenLayers(handle: WorldHandle | null): [HiddenLayers, (next: HiddenLayers) => void] {
  // The canvas is client-only (`ssr: false`), so the stored choice can be read when the state is created.
  const [hidden, setHidden] = useState<HiddenLayers>(loadHiddenLayers);
  useEffect(() => handle?.setHiddenLayers(hidden), [handle, hidden]);

  // The VR panel changes the store directly: follow it so the 2D popover and the saved choice stay in step.
  useEffect(
    () =>
      layerStore.subscribe((next) => {
        setHidden(next);
        saveHiddenLayers(next);
      }),
    [],
  );

  const update = useCallback((next: HiddenLayers) => {
    setHidden(next);
    saveHiddenLayers(next);
  }, []);
  return [hidden, update];
}
