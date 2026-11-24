import { act, cleanup, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { LyricsOverlay } from "./LyricsOverlay";

afterEach(() => {
  cleanup();
  vi.useRealTimers();
});

const lyrics = [
  { start: 1, end: 3, text: "first line" },
  { start: 4, end: 6, text: "second line" },
];

describe("LyricsOverlay (I5)", () => {
  it("shows the current verse and the next one, following the clock and seeks", () => {
    vi.useFakeTimers();
    let t = 0;
    render(<LyricsOverlay hidden={false} lyrics={lyrics} now={() => t} />);
    expect(screen.queryByText("first line", { selector: "p.text-2xl" })).toBeNull();
    expect(screen.getByText("first line")).toBeTruthy(); // dimmed next line before it starts
    t = 2;
    act(() => {
      vi.advanceTimersByTime(150);
    });
    expect(screen.getByText("first line").className).toContain("text-2xl");
    expect(screen.getByText("second line")).toBeTruthy();
    t = 5; // seek
    act(() => {
      vi.advanceTimersByTime(150);
    });
    expect(screen.getByText("second line").className).toContain("text-2xl");
  });

  it("renders nothing when hidden or without lyrics", () => {
    const { container, rerender } = render(<LyricsOverlay hidden lyrics={lyrics} now={() => 2} />);
    expect(container.firstChild).toBeNull();
    rerender(<LyricsOverlay hidden={false} lyrics={[]} now={() => 2} />);
    expect(container.firstChild).toBeNull();
  });
});
