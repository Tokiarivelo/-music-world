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
    f.emit({ type: "committed", noteId: "a", midi: 72 });
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
    f.emit({ type: "selected", noteId: "b", midi: 67 });
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
    f.emit({ type: "selected", noteId: "a", midi: 64 });
    f.ui();
    expect(screen.getByText(/Selected note: E4/)).toBeTruthy();
    expect(screen.getByRole("status")).toBeTruthy();
  });
});
