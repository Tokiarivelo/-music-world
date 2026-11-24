"use client";

import { useCallback, useEffect, useState } from "react";
import type { HiddenLayers } from "@/engine/layers";
import type { WorldHandle } from "@/xr/world-host";
import { loadHiddenLayers, saveHiddenLayers } from "../lib/layers-storage";

/** Hidden layers of the viewer: remembered per browser, pushed to the world whenever it exists or they change. */
export function useHiddenLayers(handle: WorldHandle | null): [HiddenLayers, (next: HiddenLayers) => void] {
  // The canvas is client-only (`ssr: false`), so the stored choice can be read when the state is created.
  const [hidden, setHidden] = useState<HiddenLayers>(loadHiddenLayers);
  useEffect(() => handle?.setHiddenLayers(hidden), [handle, hidden]);

  const update = useCallback((next: HiddenLayers) => {
    setHidden(next);
    saveHiddenLayers(next);
  }, []);
  return [hidden, update];
}
