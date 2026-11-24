import { act, cleanup, fireEvent, render, renderHook, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import type { EngineAnalysis, NoteEvent } from "@/engine/types";
import type { NoteEditEvent } from "@/xr/interaction/edit-controller";
import type { WorldControls, WorldHandle, WorldScene } from "@/xr/world-host";
import { useNoteEdits } from "../hooks/use-note-edits";
import { EditToolbar } from "./EditToolbar";

afterEach(() => {
  cleanup();
  vi.useRealTimers();
});

const note = (id: string, time: number, midi: number): NoteEvent => ({
  id, time, duration: 0.5, midi, velocity: 0.7, stem: "other", chordId: null,
});
const analysis: EngineAnalysis = {
  durationSec: 20, tempoBpm: 120, beats: [], chords: [], energy: [], notes: [note("a", 3, 64), note("b", 4, 67)],
};
const scene = { analysis, clock: { now: () => 2 } } as unknown as WorldScene;

function fixture(playing = false) {
  let listener: (e: NoteEditEvent) => void = () => {};
  const handle = {
    setEditMode: vi.fn(),
    setEdits: vi.fn(),
    setScore: vi.fn(),
    editCommand: vi.fn(),
    onNoteEvent: (l: (e: NoteEditEvent) => void) => {
      listener = l;
      return () => {};
    },
  } as unknown as WorldHandle;
  const controls = { isPlaying: () => playing } as unknown as WorldControls;
  const hook = renderHook(() => useNoteEdits(handle, scene, controls));
  const ui = () => render(<EditToolbar api={hook.result.current} />);
  return { handle, hook, ui, emit: (e: NoteEditEvent) => act(() => listener(e)) };
}

describe("note editing page logic (I9)", () => {
  it("editing is disabled while the song plays and the toggle says why", () => {
    const f = fixture(true);
    f.ui();
    expect((screen.getByRole("button", { name: "Edit notes" }) as HTMLButtonElement).disabled).toBe(true);
    expect(screen.getByText("Pause the song to edit its notes.")).toBeTruthy();
    expect(f.hook.result.current.enabled).toBe(false);
  });

  it("turns the editor on while paused and tells the world", () => {
    const f = fixture();
    act(() => f.hook.result.current.setEnabled(true));
    expect(f.handle.setEditMode).toHaveBeenLastCalledWith(true);
    expect(f.hook.result.current.message).toBe("Note editing on");
  });

  it("commits a drag to the history, announces it, and undo / redo / reset work", () => {
    const f = fixture();
    act(() => f.hook.result.current.setEnabled(true));
    f.emit({ type: "committed", moves: [{ noteId: "a", midi: 72 }] });
    expect(f.hook.result.current.edits.notes).toEqual([{ noteId: "a", midi: 72 }]);
    expect(f.hook.result.current.message).toBe("Moved to C5");
    expect(f.handle.setEdits).toHaveBeenLastCalledWith(f.hook.result.current.edits);
    act(() => f.hook.result.current.undo());
    expect(f.hook.result.current.edits.notes).toEqual([]);
    act(() => f.hook.result.current.redo());
    expect(f.hook.result.current.edits.notes).toHaveLength(1);
    act(() => f.hook.result.current.reset());
    expect(f.hook.result.current.edits.notes).toEqual([]);
    expect(f.hook.result.current.canUndo).toBe(true);
  });

  it("adds, renames and deletes a line; the toolbar lists it", () => {
    const f = fixture();
    act(() => f.hook.result.current.setEnabled(true));
    act(() => f.hook.result.current.addLine());
    expect(f.hook.result.current.lines.map((l) => l.id)).toEqual(["main", "line-1"]);
    const { rerender } = f.ui();
    fireEvent.click(screen.getByRole("button", { name: "Lines" }));
    expect(screen.getAllByLabelText("Line color").length).toBe(2);
    act(() => f.hook.result.current.patchLine("line-1", { color: "#00ff88" }));
    expect(f.hook.result.current.lines[1]!.color).toBe("#00ff88");
    act(() => f.hook.result.current.removeLine("line-1"));
    expect(f.hook.result.current.lines).toHaveLength(1);
    expect(f.hook.result.current.message).toMatch(/Line deleted/);
    rerender(<EditToolbar api={f.hook.result.current} />);
  });

  it("selects a note, edits its properties, duplicates and deletes it", () => {
    const f = fixture();
    act(() => f.hook.result.current.setEnabled(true));
    f.emit({ type: "selection", ids: ["b"], primary: { noteId: "b", midi: 67 } });
    expect(f.hook.result.current.selected?.id).toBe("b");
    act(() => f.hook.result.current.patchNote({ midi: 60, velocity: 0.2, color: "#ff0000" }));
    expect(f.hook.result.current.selected).toMatchObject({ midi: 60, velocity: 0.2 });
    expect(f.hook.result.current.selectedColor).toBe("#ff0000");
    act(() => f.hook.result.current.copyNote());
    expect(f.hook.result.current.selected?.id).toBe("user:1");
    act(() => f.hook.result.current.removeNote());
    expect(f.hook.result.current.edits.added).toEqual([]);
    expect(f.hook.result.current.selected).toBeNull();
    act(() => f.hook.result.current.addNoteAt());
    expect(f.hook.result.current.edits.added[0]).toMatchObject({ time: 3, midi: 64 });
  });

  it("the property panel shows the selected note", () => {
    const f = fixture();
    act(() => f.hook.result.current.setEnabled(true));
    f.emit({ type: "selection", ids: ["a"], primary: { noteId: "a", midi: 64 } });
    f.ui();
    expect(screen.getByText(/Selected note: E4/)).toBeTruthy();
    expect(screen.getByRole("status")).toBeTruthy();
  });

  it("acts on every selected note: move together, recolor, copy and paste, delete", () => {
    const f = fixture();
    act(() => f.hook.result.current.setEnabled(true));
    f.emit({ type: "selection", ids: ["a", "b"], primary: { noteId: "b", midi: 67 } });
    expect(f.hook.result.current.selectedCount).toBe(2);
    f.emit({ type: "committed", moves: [{ noteId: "a", midi: 65 }, { noteId: "b", midi: 69 }] });
    expect(f.hook.result.current.edits.notes.map((e) => [e.noteId, e.midi])).toEqual([["a", 65], ["b", 69]]);
    act(() => f.hook.result.current.patchNote({ color: "#00ff00" }));
    expect(f.hook.result.current.edits.notes.every((e) => e.color === "#00ff00")).toBe(true);
    act(() => f.hook.result.current.copySelection());
    act(() => f.hook.result.current.paste());
    const added = f.hook.result.current.edits.added;
    expect(added.map((a) => a.midi)).toEqual([65, 69]);
    expect(added[0]!.time).toBe(3); // clock 2 + 1 s, relative spacing kept
    expect(added[1]!.time).toBeCloseTo(3 + 1);
    expect(added.every((a) => a.color === "#00ff00")).toBe(true);
    f.emit({ type: "selection", ids: ["a", "b"], primary: { noteId: "b", midi: 69 } });
    act(() => f.hook.result.current.removeNote());
    expect(f.hook.result.current.edits.notes.every((e) => e.deleted === true)).toBe(true);
    expect(f.hook.result.current.selectedCount).toBe(0);
  });
});

describe("persistence and Play my edits (I9 requirement 8, 9)", () => {
  afterEach(() => {
    localStorage.clear();
  });

  function withPersistence(persistence: Parameters<typeof useNoteEdits>[3], playing = false) {
    const handle = {
      setEditMode: vi.fn(),
      setEdits: vi.fn(),
      setScore: vi.fn(),
      editCommand: vi.fn(),
      onNoteEvent: () => () => {},
    } as unknown as WorldHandle;
    const controls = { isPlaying: () => playing } as unknown as WorldControls;
    const hook = renderHook(() => useNoteEdits(handle, scene, controls, persistence));
    return { handle, hook };
  }

  it("remembers the edits in the browser and restores them for the same song", () => {
    const first = withPersistence({ key: "sha256:abc" });
    act(() => first.hook.result.current.setEnabled(true));
    act(() => first.hook.result.current.addLine());
    expect(localStorage.getItem("mw.edits.v1:sha256:abc")).toContain("line-1");
    first.hook.unmount();
    const again = withPersistence({ key: "sha256:abc" });
    expect(again.hook.result.current.lines.map((l) => l.id)).toEqual(["main", "line-1"]);
    const other = withPersistence({ key: "sha256:other" });
    expect(other.hook.result.current.lines).toHaveLength(1);
  });

  it("ignores a corrupted stored value and clears the key when the edits are reset to nothing", () => {
    localStorage.setItem("mw.edits.v1:k", "{not json");
    const h = withPersistence({ key: "k" });
    expect(h.hook.result.current.edits.notes).toEqual([]);
    act(() => h.hook.result.current.addLine());
    act(() => h.hook.result.current.undo());
    expect(localStorage.getItem("mw.edits.v1:k")).toBeNull();
  });

  it("the server copy wins when it has content, and an empty page never overwrites it", async () => {
    vi.useFakeTimers();
    const serverDoc = { version: 1, lines: [], notes: [{ noteId: "a", midi: 70 }], added: [] };
    const save = vi.fn((doc: { notes: unknown[] }) => Promise.resolve(doc.notes.length).then(() => undefined));
    const remote = { load: () => Promise.resolve(serverDoc), save: save as unknown as (e: never) => Promise<void> };
    const h = withPersistence({ key: "k", remote });
    await act(async () => {
      await vi.advanceTimersByTimeAsync(1500);
    });
    expect(h.hook.result.current.edits.notes).toEqual([{ noteId: "a", midi: 70 }]);
    // loading a server copy writes it back unchanged at most; it never saves an empty document first
    expect(save.mock.calls.every((call) => call[0].notes.length === 1)).toBe(true);
    act(() => h.hook.result.current.removeNote());
    act(() => h.hook.result.current.addLine());
    await act(async () => {
      await vi.advanceTimersByTimeAsync(1500);
    });
    expect(save).toHaveBeenLastCalledWith(h.hook.result.current.edits);
  });

  it("does not call the server when signed out (the load fails) and nothing is edited", async () => {
    vi.useFakeTimers();
    const save = vi.fn(() => Promise.resolve());
    const remote = { load: () => Promise.reject(new Error("401")), save };
    withPersistence({ key: "k", remote });
    await act(async () => {
      await vi.advanceTimersByTimeAsync(3000);
    });
    expect(save).not.toHaveBeenCalled();
  });

  it("Play my edits sends the score to the world, honors mute and solo, and tells the page to mute the song", () => {
    const onScoreMode = vi.fn();
    const h = withPersistence({ onScoreMode });
    expect(onScoreMode).toHaveBeenLastCalledWith(false);
    act(() => h.hook.result.current.setPlayMine(true));
    expect(onScoreMode).toHaveBeenLastCalledWith(true);
    expect(h.handle.setScore).toHaveBeenLastCalledWith([
      { time: 3, duration: 0.5, midi: 64, velocity: 0.7 },
      { time: 4, duration: 0.5, midi: 67, velocity: 0.7 },
    ]);
    act(() => h.hook.result.current.addLine());
    act(() => h.hook.result.current.patchLine("main", { muted: true }));
    expect(h.handle.setScore).toHaveBeenLastCalledWith([]);
    act(() => h.hook.result.current.setPlayMine(false));
    expect(h.handle.setScore).toHaveBeenLastCalledWith(null);
    expect(onScoreMode).toHaveBeenLastCalledWith(false);
  });
});
