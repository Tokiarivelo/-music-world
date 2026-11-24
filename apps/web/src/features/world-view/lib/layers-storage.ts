import { LAYER_IDS, NOTHING_HIDDEN, parseHidden, type HiddenLayers } from "@/engine/layers";

/** Hidden layers are a preference of the browser (I5 requirement 3): one key, every storage access in try / catch. */
export const LAYERS_STORAGE_KEY = "mw.layers.hidden";

export function loadHiddenLayers(): HiddenLayers {
  try {
    const raw = typeof localStorage === "undefined" ? null : localStorage.getItem(LAYERS_STORAGE_KEY);
    return raw ? parseHidden(JSON.parse(raw)) : NOTHING_HIDDEN;
  } catch {
    return NOTHING_HIDDEN;
  }
}

export function saveHiddenLayers(hidden: HiddenLayers): void {
  try {
    const known = LAYER_IDS.filter((id) => hidden.has(id));
    if (known.length === 0) localStorage.removeItem(LAYERS_STORAGE_KEY);
    else localStorage.setItem(LAYERS_STORAGE_KEY, JSON.stringify(known));
  } catch {
    // private window or blocked storage: the choice only lasts for this page
  }
}
