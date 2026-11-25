import { act, renderHook } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { Analysis } from "@/templates/generated";
import { MIN_VOCAL_NOTES, POLL_MS, hasVoice, useLyricsSearch } from "./use-lyrics-search";

const api = vi.hoisted(() => ({ startLyricsSearch: vi.fn(), getJobStatus: vi.fn(), getProjectAnalysis: vi.fn() }));
vi.mock("../api/project.api", () => api);

const note = (stem: string) => ({ id: "n", time: 1, duration: 1, midi: 60, velocity: 0.5, stem, chordId: null });
const withNotes = (stem: string, count: number) => ({ notes: Array.from({ length: count }, () => note(stem)), lyrics: [] }) as unknown as Analysis;

beforeEach(() => {
  vi.useFakeTimers();
  Object.values(api).forEach((f) => f.mockReset());
});
afterEach(() => vi.useRealTimers());

describe("lyrics search (I17)", () => {
  it("a voice needs enough vocal notes", () => {
    expect(hasVoice(withNotes("vocals", MIN_VOCAL_NOTES))).toBe(true);
    expect(hasVoice(withNotes("vocals", MIN_VOCAL_NOTES - 1))).toBe(false);
    expect(hasVoice(withNotes("other", 50))).toBe(false);
  });

  it("starts the job, follows it, and hands over the updated analysis", async () => {
    const found = { ...withNotes("vocals", 10), lyrics: [{ start: 1, end: 2, text: "x" }] } as unknown as Analysis;
    api.startLyricsSearch.mockResolvedValue("job-1");
    api.getJobStatus.mockResolvedValueOnce({ status: "running" }).mockResolvedValueOnce({ status: "done" });
    api.getProjectAnalysis.mockResolvedValue(found);
    const onFound = vi.fn();
    const { result } = renderHook(() => useLyricsSearch("p1", withNotes("vocals", 10), onFound));
    expect(result.current.voice).toBe(true);
    act(() => result.current.start());
    expect(result.current.status).toBe("searching");
    await act(() => vi.advanceTimersByTimeAsync(POLL_MS * 3));
    expect(onFound).toHaveBeenCalledWith(found);
    expect(result.current.status).toBe("idle");
    expect(api.startLyricsSearch).toHaveBeenCalledWith("p1");
  });

  it("reports nothing found when the job ends with no lyrics, and a failure when it breaks", async () => {
    api.startLyricsSearch.mockResolvedValue("job-2");
    api.getJobStatus.mockResolvedValue({ status: "done" });
    api.getProjectAnalysis.mockResolvedValue(withNotes("vocals", 10));
    const onFound = vi.fn();
    const { result } = renderHook(() => useLyricsSearch("p1", withNotes("vocals", 10), onFound));
    act(() => result.current.start());
    await act(() => vi.advanceTimersByTimeAsync(POLL_MS * 2));
    expect(result.current.status).toBe("notFound");
    expect(onFound).not.toHaveBeenCalled();
    api.startLyricsSearch.mockRejectedValue(new Error("down"));
    act(() => result.current.start());
    await act(() => vi.advanceTimersByTimeAsync(10));
    expect(result.current.status).toBe("failed");
  });

  it("sends the artist and title typed by the listener", async () => {
    api.startLyricsSearch.mockResolvedValue("job-3");
    api.getJobStatus.mockResolvedValue({ status: "done" });
    api.getProjectAnalysis.mockResolvedValue(withNotes("vocals", 10));
    const { result } = renderHook(() => useLyricsSearch("p1", withNotes("vocals", 10), vi.fn()));
    act(() => result.current.start({ artist: "Eric Clapton", title: "Layla" }));
    await act(() => vi.advanceTimersByTimeAsync(POLL_MS * 2));
    expect(api.startLyricsSearch).toHaveBeenCalledWith("p1", { artist: "Eric Clapton", title: "Layla" });
  });
});
