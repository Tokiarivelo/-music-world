import {
  applyContrast,
  generatePalette,
  liftBrightness,
  lightLevelFor,
  PALETTE_ROLES,
  seedFromNumber,
  type Palette,
  type PaletteRole,
} from "@/xr/palette-generator";
import type { PaletteOverride } from "@/xr/palette-override";

/** I4 requirements 3–6: the listener's color choice, a view override on top of the template. */
export interface PaletteState {
  /** Seed of the last randomize (or of the `?palette=` link), shown as "Scheme #SEED". */
  seed: string | null;
  /** Colors that differ from the template; `null` = the template's own colors. */
  override: PaletteOverride | null;
  locked: readonly PaletteRole[];
  /** Brightness slider in [-1, 1]: lifts background and terrain on top of the colors above; 0 = unchanged. */
  brightness: number;
  /** Contrast slider in [-1, 1]: base vs neon lightness gap; 0 = unchanged. */
  contrast: number;
}

const EMPTY: PaletteState = { seed: null, override: null, locked: [], brightness: 0, contrast: 0 };
const HISTORY_LIMIT = 50;
const HEX = /^#[0-9a-f]{6}$/;

export interface PaletteStorage {
  getItem(key: string): string | null;
  setItem(key: string, value: string): void;
  removeItem(key: string): void;
}

const storageKey = (templateId: string) => `mw.palette.${templateId}`;

function safeStorage(): PaletteStorage | null {
  try {
    return typeof localStorage === "undefined" ? null : localStorage;
  } catch {
    return null;
  }
}

function sanitize(value: unknown): PaletteState {
  if (!value || typeof value !== "object") return EMPTY;
  const raw = value as Partial<{ seed: unknown; override: unknown; locked: unknown; brightness: unknown; contrast: unknown }>;
  const override: PaletteOverride = {};
  if (raw.override && typeof raw.override === "object") {
    for (const role of PALETTE_ROLES) {
      const color = (raw.override as Record<string, unknown>)[role];
      if (typeof color === "string" && HEX.test(color)) override[role] = color;
    }
  }
  const locked = Array.isArray(raw.locked)
    ? PALETTE_ROLES.filter((r) => (raw.locked as unknown[]).includes(r))
    : [];
  return {
    seed: typeof raw.seed === "string" && raw.seed.length <= 16 ? raw.seed : null,
    override: Object.keys(override).length > 0 ? override : null,
    locked,
    brightness:
      typeof raw.brightness === "number" && Number.isFinite(raw.brightness)
        ? Math.max(-1, Math.min(1, raw.brightness))
        : 0,
    contrast:
      typeof raw.contrast === "number" && Number.isFinite(raw.contrast)
        ? Math.max(-1, Math.min(1, raw.contrast))
        : 0,
  };
}

/** What the world shows: the template colors, the chosen override, then the brightness lift. `null` = untouched. */
export function effectiveOverride(templatePalette: Palette, state: PaletteState): PaletteOverride | null {
  const chosen = { ...templatePalette, ...(state.override ?? {}) };
  const lifted = state.brightness === 0 ? chosen : liftBrightness(chosen, state.brightness);
  return diff(templatePalette, applyContrast(lifted, state.contrast));
}

/** Scene light multiplier that goes with the brightness slider (1 = template look). */
export function effectiveLightLevel(state: PaletteState): number {
  return lightLevelFor(state.brightness);
}

/** `?palette=<seed>` → seed (letters and digits only, ≤ 16 characters), else null. */
export function parsePaletteSeed(search: string): string | null {
  const value = new URLSearchParams(search).get("palette");
  return value && /^[0-9A-Za-z]{1,16}$/.test(value) ? value.toUpperCase() : null;
}

/** The URL of the current page carrying the scheme seed, to copy and share. */
export function paletteLink(href: string, seed: string): string {
  const url = new URL(href);
  url.searchParams.set("palette", seed);
  return url.toString();
}

function diff(template: Palette, colors: Palette): PaletteOverride | null {
  const out: PaletteOverride = {};
  for (const role of PALETTE_ROLES) if (colors[role] !== template[role]) out[role] = colors[role];
  return Object.keys(out).length > 0 ? out : null;
}

export interface PaletteStore {
  getState(): PaletteState;
  subscribe(listener: () => void): () => void;
  canUndo(): boolean;
  canRedo(): boolean;
  /** New scheme from a fresh seed (or the given one); locked roles stay. */
  randomize(seed?: string): void;
  setColor(role: PaletteRole, hex: string): void;
  toggleLock(role: PaletteRole): void;
  setBrightness(value: number): void;
  setContrast(value: number): void;
  undo(): void;
  redo(): void;
  /** "Reset to the template": clears the override, the locks and the saved choice. */
  reset(): void;
}

export interface PaletteStoreOptions {
  templateId: string;
  templatePalette: Palette;
  /** `location.search` of the page: a valid `?palette=` seed wins over the saved choice. */
  search?: string;
  storage?: PaletteStorage | null;
  /** Source of new seeds; the app passes a time-based number, tests pass a counter (no `Math.random`). */
  nextSeed?: () => string;
}

export function createPaletteStore(options: PaletteStoreOptions): PaletteStore {
  const { templateId, templatePalette } = options;
  const storage = options.storage === undefined ? safeStorage() : options.storage;
  let counter = Date.now();
  const nextSeed = options.nextSeed ?? (() => seedFromNumber((counter = (counter * 1103515245 + 12345) >>> 0)));
  const listeners = new Set<() => void>();
  let past: PaletteState[] = [];
  let future: PaletteState[] = [];

  let state = EMPTY;
  try {
    const saved = storage?.getItem(storageKey(templateId));
    if (saved) state = sanitize(JSON.parse(saved));
  } catch {
    state = EMPTY;
  }
  const linkSeed = parsePaletteSeed(options.search ?? "");
  if (linkSeed) {
    state = {
      seed: linkSeed,
      override: diff(templatePalette, generatePalette(linkSeed)),
      locked: [],
      brightness: 0,
      contrast: 0,
    };
  }

  const persist = () => {
    try {
      if (!storage) return;
      if (state.override || state.locked.length > 0 || state.brightness !== 0 || state.contrast !== 0) storage.setItem(storageKey(templateId), JSON.stringify(state));
      else storage.removeItem(storageKey(templateId));
    } catch {
      /* private mode or blocked storage: the choice just does not persist */
    }
  };
  const commit = (next: PaletteState, record = true) => {
    if (record) {
      past = [...past, state].slice(-HISTORY_LIMIT);
      future = [];
    }
    state = next;
    persist();
    listeners.forEach((fn) => fn());
  };
  const current = (): Palette => ({ ...templatePalette, ...(state.override ?? {}) });

  return {
    getState: () => state,
    subscribe(listener) {
      listeners.add(listener);
      return () => listeners.delete(listener);
    },
    canUndo: () => past.length > 0,
    canRedo: () => future.length > 0,
    randomize(seed) {
      const chosen = seed ?? nextSeed();
      const locked: Partial<Palette> = {};
      for (const role of state.locked) locked[role] = current()[role];
      commit({ ...state, seed: chosen, override: diff(templatePalette, generatePalette(chosen, { locked })) });
    },
    setColor(role, hex) {
      if (!HEX.test(hex)) return;
      commit({ ...state, override: diff(templatePalette, { ...current(), [role]: hex }) });
    },
    toggleLock(role) {
      const locked = state.locked.includes(role) ? state.locked.filter((r) => r !== role) : [...state.locked, role];
      commit({ ...state, locked: PALETTE_ROLES.filter((r) => locked.includes(r)) }, false);
    },
    setBrightness(value) {
      if (!Number.isFinite(value)) return;
      commit({ ...state, brightness: Math.max(-1, Math.min(1, value)) }, false);
    },
    setContrast(value) {
      if (!Number.isFinite(value)) return;
      commit({ ...state, contrast: Math.max(-1, Math.min(1, value)) }, false);
    },
    undo() {
      const previous = past.at(-1);
      if (!previous) return;
      future = [state, ...future];
      past = past.slice(0, -1);
      commit(previous, false);
    },
    redo() {
      const next = future[0];
      if (!next) return;
      past = [...past, state];
      future = future.slice(1);
      commit(next, false);
    },
    reset() {
      past = [];
      future = [];
      commit(EMPTY, false);
    },
  };
}

const stores = new Map<string, PaletteStore>();

/** One store per template id for the page lifetime, so the canvas and the popover share the same choice. */
export function getPaletteStore(templateId: string, templatePalette: Palette): PaletteStore {
  let store = stores.get(templateId);
  if (!store) {
    store = createPaletteStore({
      templateId,
      templatePalette,
      search: typeof location === "undefined" ? "" : location.search,
    });
    stores.set(templateId, store);
  }
  return store;
}
