import { describe, expect, it } from "vitest";
import { generatePalette } from "@/xr/palette-generator";
import {
  createPaletteStore,
  effectiveLightLevel,
  effectiveOverride,
  paletteLink,
  parsePaletteSeed,
  type PaletteStorage,
} from "./palette-store";

const TEMPLATE = generatePalette("TEMPLATE");

function memory(): PaletteStorage & { data: Map<string, string> } {
  const data = new Map<string, string>();
  return {
    data,
    getItem: (k) => data.get(k) ?? null,
    setItem: (k, v) => void data.set(k, v),
    removeItem: (k) => void data.delete(k),
  };
}

function make(extra: Partial<Parameters<typeof createPaletteStore>[0]> = {}) {
  let n = 0;
  return createPaletteStore({
    templateId: "t1",
    templatePalette: TEMPLATE,
    storage: memory(),
    nextSeed: () => `S${++n}`,
    ...extra,
  });
}

describe("palette store", () => {
  it("starts on the template colors", () => {
    expect(make().getState()).toEqual({ seed: null, override: null, locked: [], brightness: 0, contrast: 0 });
  });

  it("randomize is deterministic per seed, keeps locks, and undo/redo walk the history", () => {
    const store = make();
    store.setColor("primary", "#112233");
    store.toggleLock("primary");
    store.randomize("ABC");
    expect(store.getState().seed).toBe("ABC");
    expect(store.getState().override?.primary).toBe("#112233");
    expect(store.getState().override?.background).toBe(generatePalette("ABC").background);
    store.undo();
    expect(store.getState().seed).toBeNull();
    expect(store.canRedo()).toBe(true);
    store.redo();
    expect(store.getState().seed).toBe("ABC");
    store.undo();
    store.undo();
    expect(store.getState().override).toBeNull();
    expect(store.canUndo()).toBe(false);
  });

  it("ignores invalid hex and drops roles equal to the template", () => {
    const store = make();
    store.setColor("accent", "red");
    expect(store.getState().override).toBeNull();
    store.setColor("accent", "#010203");
    store.setColor("accent", TEMPLATE.accent);
    expect(store.getState().override).toBeNull();
  });

  it("persists per template id and reset clears it", () => {
    const storage = memory();
    const a = make({ storage });
    a.setColor("terrain", "#0a0b0c");
    a.toggleLock("terrain");
    expect(make({ storage }).getState().override).toEqual({ terrain: "#0a0b0c" });
    expect(make({ storage }).getState().locked).toEqual(["terrain"]);
    expect(make({ storage, templateId: "other" }).getState().override).toBeNull();
    a.reset();
    expect(storage.data.size).toBe(0);
    expect(make({ storage }).getState().override).toBeNull();
  });

  it("survives broken or throwing storage", () => {
    const broken: PaletteStorage = {
      getItem: () => "{not json",
      setItem: () => {
        throw new Error("quota");
      },
      removeItem: () => {
        throw new Error("blocked");
      },
    };
    const store = make({ storage: broken });
    expect(store.getState().override).toBeNull();
    expect(() => store.randomize()).not.toThrow();
    expect(make({ storage: null }).getState().seed).toBeNull();
  });

  it("a ?palette= link gives the same colors on every device and wins over the saved choice", () => {
    const storage = memory();
    make({ storage }).setColor("primary", "#111111");
    const one = make({ storage, search: "?palette=4f2a9" });
    const two = make({ storage: memory(), search: "?x=1&palette=4F2A9" });
    expect(one.getState().seed).toBe("4F2A9");
    expect(one.getState().override).toEqual(two.getState().override);
  });

  it("brightness lifts the shown colors, persists, and reset clears it", () => {
    const storage = memory();
    const store = make({ storage });
    expect(effectiveOverride(TEMPLATE, store.getState())).toBeNull();
    store.setBrightness(5);
    expect(store.getState().brightness).toBe(1);
    const shown = effectiveOverride(TEMPLATE, store.getState());
    expect(shown?.background).not.toBe(TEMPLATE.background);
    expect(shown?.primary).toBeUndefined();
    expect(make({ storage }).getState().brightness).toBe(1);
    store.reset();
    expect(make({ storage }).getState().brightness).toBe(0);
  });

  it("contrast changes the shown colors, persists, and the light level follows brightness", () => {
    const storage = memory();
    const store = make({ storage });
    store.setContrast(0.8);
    expect(effectiveOverride(TEMPLATE, store.getState())?.background).not.toBe(TEMPLATE.background);
    expect(make({ storage }).getState().contrast).toBe(0.8);
    expect(effectiveLightLevel(store.getState())).toBe(1);
    store.setBrightness(1);
    expect(effectiveLightLevel(store.getState())).toBeCloseTo(1.4);
    store.reset();
    expect(make({ storage }).getState().contrast).toBe(0);
  });

  it("parses and builds links safely", () => {
    expect(parsePaletteSeed("?palette=<script>")).toBeNull();
    expect(parsePaletteSeed("?palette=" + "a".repeat(17))).toBeNull();
    expect(parsePaletteSeed("")).toBeNull();
    expect(paletteLink("https://x.test/play/demo?lang=fr", "4F2A9")).toBe("https://x.test/play/demo?lang=fr&palette=4F2A9");
  });
});
