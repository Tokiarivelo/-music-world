"use client";

import { useCallback, useEffect, useState } from "react";
import type { WorldHandle } from "@/xr/world-host";
import { loadViewPrefs, saveViewPrefs, type ViewPrefs } from "../lib/view-storage";

/** Arrangement and northern-lights mode: remembered per browser, pushed to the world when it exists or they change. */
export function useViewPrefs(handle: WorldHandle | null): [ViewPrefs, (patch: Partial<ViewPrefs>) => void] {
  const [prefs, setPrefs] = useState<ViewPrefs>(loadViewPrefs);
  useEffect(() => {
    handle?.setLayout(prefs.layout);
    handle?.setAuroraSky(prefs.aurora);
  }, [handle, prefs]);
  const update = useCallback((patch: Partial<ViewPrefs>) => {
    setPrefs((p) => {
      const next = { ...p, ...patch };
      saveViewPrefs(next);
      return next;
    });
  }, []);
  return [prefs, update];
}
