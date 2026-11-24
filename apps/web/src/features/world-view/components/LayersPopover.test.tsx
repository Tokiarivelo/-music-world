import { act, cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { NOTHING_HIDDEN, type Activity, type HiddenLayers } from "@/engine/layers";
import { LayersPopover } from "./LayersPopover";

afterEach(() => {
  cleanup();
  vi.useRealTimers();
});

const palette = { background: "#000000", terrain: "#111111", primary: "#ff00ff", accent: "#00ffff", secondary: "#ffff00", staff: "#ffffff" };

function setup(hidden: HiddenLayers = NOTHING_HIDDEN, hasLyrics = true, activity: () => Activity | null = () => null) {
  const onChange = vi.fn();
  render(<LayersPopover activity={activity} hasLyrics={hasLyrics} hidden={hidden} onChange={onChange} palette={palette} />);
  fireEvent.click(screen.getByRole("button", { name: "Layers" }));
  return onChange;
}

describe("LayersPopover (I5)", () => {
  it("opens, lists every layer with aria-pressed and toggles one", () => {
    const onChange = setup();
    expect(screen.getAllByRole("button", { pressed: true }).length).toBeGreaterThanOrEqual(9);
    fireEvent.click(screen.getByRole("button", { name: /Drums/ }));
    expect(onChange).toHaveBeenCalledOnce();
    expect([...onChange.mock.calls[0]![0]]).toEqual(["drums"]);
  });

  it("shows a hidden layer as not pressed", () => {
    setup(new Set(["bass"]));
    expect(screen.getByRole("button", { name: /Bass/ }).getAttribute("aria-pressed")).toBe("false");
    expect(screen.getByRole("button", { name: /Drums/ }).getAttribute("aria-pressed")).toBe("true");
  });

  it("applies a preset and marks the matching one", () => {
    const onChange = setup();
    expect(screen.getByRole("button", { name: "Everything" }).getAttribute("aria-pressed")).toBe("true");
    fireEvent.click(screen.getByRole("button", { name: "Voice and lyrics" }));
    const hidden = onChange.mock.calls[0]![0] as HiddenLayers;
    expect(hidden.has("drums")).toBe(true);
    expect(hidden.has("vocals")).toBe(false);
    expect(hidden.has("lyrics")).toBe(false);
  });

  it("disables Lyrics and says why when the song has none", () => {
    setup(NOTHING_HIDDEN, false);
    const lyrics = screen.getByRole("button", { name: /Lyrics/ }) as HTMLButtonElement;
    expect(lyrics.disabled).toBe(true);
    expect(screen.getByText(/add a \.lrc file/)).toBeTruthy();
  });

  it("updates the stem meters while open", () => {
    vi.useFakeTimers();
    const activity = vi.fn(() => ({ drums: 0.5, bass: 0, vocals: 0, other: 0 }));
    setup(NOTHING_HIDDEN, true, activity);
    act(() => {
      vi.advanceTimersByTime(250);
    });
    expect(activity).toHaveBeenCalled();
  });

  it("polls the meters less often with reduced motion", () => {
    vi.useFakeTimers();
    const original = globalThis.matchMedia;
    globalThis.matchMedia = ((q: string) => ({ matches: q.includes("reduce"), media: q })) as never;
    try {
      const activity = vi.fn(() => ({ drums: 0, bass: 0, vocals: 0, other: 0 }));
      setup(NOTHING_HIDDEN, true, activity);
      act(() => {
        vi.advanceTimersByTime(450);
      });
      expect(activity).not.toHaveBeenCalled();
      act(() => {
        vi.advanceTimersByTime(100);
      });
      expect(activity).toHaveBeenCalledOnce();
    } finally {
      globalThis.matchMedia = original;
    }
  });

  it("closes with Escape", () => {
    setup();
    fireEvent.keyDown(screen.getByRole("region", { name: "Layers" }), { key: "Escape" });
    expect(screen.queryByRole("region", { name: "Layers" })).toBeNull();
  });
});
