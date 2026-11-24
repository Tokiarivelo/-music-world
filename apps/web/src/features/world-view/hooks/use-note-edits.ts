"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import {
  MAIN_LINE_ID,
  addLine,
  addNote,
  applyEdits,
  commit,
  deleteLine,
  duplicateLine,
  editNote,
  linesOf,
  moveLine,
  newHistory,
  noteName,
  redo,
  resetAll,
  resetNote,
  undo,
  updateLine,
  type History,
  type LayoutEdits,
  type StaffLine,
} from "@/engine/edits";
import type { NoteEvent } from "@/engine/types";
import { useT } from "@/i18n";
import type { WorldControls, WorldHandle, WorldScene } from "@/xr/world-host";

const PAUSE_POLL_MS = 200;

export interface NoteEditsApi {
  enabled: boolean;
  /** The song is paused: editing can be turned on. */
  paused: boolean;
  setEnabled(on: boolean): void;
  edits: LayoutEdits;
  lines: readonly StaffLine[];
  canUndo: boolean;
  canRedo: boolean;
  undo(): void;
  redo(): void;
  reset(): void;
  /** The announcement for the `aria-live` region. */
  message: string;
  selected: NoteEvent | null;
  /** Number of selected notes (Shift-click adds); edits below apply to all of them. */
  selectedCount: number;
  copySelection(): void;
  paste(): void;
  selectedLine: string;
  selectedColor: string | undefined;
  lineName(line: StaffLine): string;
  addLine(): void;
  patchLine(id: string, patch: Partial<Omit<StaffLine, "id">>): void;
  removeLine(id: string): void;
  copyLine(id: string): void;
  shiftLine(id: string, delta: -1 | 1): void;
  patchNote(patch: Partial<Pick<NoteEvent, "midi" | "time" | "duration" | "velocity">> & { color?: string; lineId?: string }): void;
  removeNote(): void;
  copyNote(): void;
  restoreNote(): void;
  addNoteAt(): void;
  playSelected(): void;
}

/**
 * The note-edit document of the page (I9): its undo history, the selection, the announcements, and the link to the
 * world (`setEdits`, `setEditMode`, `onNoteEvent`). The world only displays; the document lives here.
 */
export function useNoteEdits(
  handle: WorldHandle | null,
  scene: WorldScene | undefined,
  controls: WorldControls | undefined,
): NoteEditsApi {
  const analysis = scene?.analysis;
  const t = useT("world");
  const [history, setHistory] = useState<History>(() => newHistory());
  const [enabled, setEnabledState] = useState(false);
  const [paused, setPaused] = useState(() => (controls ? !controls.isPlaying() : false));
  const [selectedIds, setSelectedIds] = useState<readonly string[]>([]);
  const [clipboard, setClipboard] = useState<readonly NoteEvent[]>([]);
  const selectedId = selectedIds.at(-1) ?? null;
  const [message, setMessage] = useState("");
  // Another song starts from its own notes: edits belong to one analysis (state adjusted during render).
  const [forAnalysis, setForAnalysis] = useState(analysis);
  if (forAnalysis !== analysis) {
    setForAnalysis(analysis);
    setHistory(newHistory());
    setSelectedIds([]);
  }

  const edits = history.present;
  const lines = useMemo(() => linesOf(edits), [edits]);
  const edited = useMemo(() => (analysis ? applyEdits(analysis, edits) : null), [analysis, edits]);
  const selected = useMemo(
    () => (selectedId && edited ? edited.analysis.notes.find((n) => n.id === selectedId) ?? null : null),
    [edited, selectedId],
  );

  const lineName = useCallback((l: StaffLine) => (l.id === MAIN_LINE_ID ? t("edit.line.main") : l.name), [t]);
  const announce = useCallback((text: string) => setMessage(text), []);
  const mutate = useCallback((fn: (e: LayoutEdits) => LayoutEdits) => setHistory((h) => commit(h, fn(h.present))), []);

  // Paused is read from the player (the clock is the only time source); editing stops when the song plays.
  useEffect(() => {
    if (!controls) return;
    const read = () => {
      const isPaused = !controls.isPlaying();
      setPaused(isPaused);
      if (!isPaused) setEnabledState(false); // playing again ends the editing session
    };
    const id = setInterval(read, PAUSE_POLL_MS);
    return () => clearInterval(id);
  }, [controls]);
  const active = enabled && paused;
  useEffect(() => handle?.setEditMode(active), [handle, active]);
  useEffect(() => handle?.setEdits(edits), [handle, edits]);


  useEffect(() => {
    if (!handle) return;
    return handle.onNoteEvent((event) => {
      if (event.type === "selection") {
        setSelectedIds(event.ids);
        if (event.primary) announce(t("edit.live.selected", { name: noteName(event.primary.midi) }));
      } else if (event.type === "moved") {
        announce(t("edit.live.moved", { name: noteName(event.midi) }));
      } else if (event.type === "committed") {
        setHistory((h) => commit(h, event.moves.reduce((acc, m) => editNote(acc, m.noteId, { midi: m.midi }), h.present)));
        const last = event.moves.at(-1);
        if (last) announce(t("edit.live.moved", { name: noteName(last.midi) }));
      } else if (event.type === "cancelled") {
        announce(t("edit.live.cancelled"));
      }
    });
  }, [handle, t, announce]);

  const setEnabled = useCallback(
    (on: boolean) => {
      setEnabledState(on);
      announce(t(on ? "edit.live.enabled" : "edit.live.disabled"));
    },
    [announce, t],
  );

  const selectedLine = selected && edited ? edited.lineOf.get(selected.id) ?? MAIN_LINE_ID : MAIN_LINE_ID;

  return {
    enabled: active,
    paused,
    setEnabled,
    edits,
    lines,
    canUndo: history.past.length > 0,
    canRedo: history.future.length > 0,
    undo: () => {
      setHistory(undo);
      announce(t("edit.live.undo"));
    },
    redo: () => {
      setHistory(redo);
      announce(t("edit.live.redo"));
    },
    reset: () => {
      setHistory(resetAll);
      setSelectedIds([]);
      announce(t("edit.live.reset"));
    },
    message,
    selected,
    selectedCount: selectedIds.length,
    copySelection: () => {
      const notes = edited ? selectedIds.flatMap((id) => edited.analysis.notes.filter((n) => n.id === id)) : [];
      setClipboard(notes);
    },
    paste: () => {
      if (!scene || clipboard.length === 0) return;
      const t0 = Math.min(...clipboard.map((n) => n.time));
      const base = scene.clock.now() + 1;
      let next = edits;
      let last = "";
      for (const n of clipboard) {
        const made = addNote(next, {
          time: base + (n.time - t0),
          duration: n.duration,
          midi: n.midi,
          velocity: n.velocity,
          lineId: edited?.lineOf.get(n.id) ?? MAIN_LINE_ID,
          ...(edited?.colorOf.get(n.id) ? { color: edited.colorOf.get(n.id) } : {}),
        });
        next = made.edits;
        last = made.id;
      }
      mutate(() => next);
      setSelectedIds([last]);
      announce(t("edit.live.noteAdded"));
    },
    selectedLine,
    selectedColor: selected ? edited?.colorOf.get(selected.id) : undefined,
    lineName,
    addLine: () => {
      const name = t("edit.line.new", { n: lines.length });
      mutate((e) => addLine(e, name)?.edits ?? e);
      announce(t("edit.live.lineAdded", { name }));
    },
    patchLine: (id, patch) => mutate((e) => updateLine(e, id, patch)),
    removeLine: (id) => {
      mutate((e) => deleteLine(e, id));
      announce(t("edit.live.lineDeleted"));
    },
    copyLine: (id) => {
      const src = lines.find((l) => l.id === id);
      if (src) mutate((e) => duplicateLine(e, id, `${lineName(src)} ${lines.length}`)?.edits ?? e);
    },
    shiftLine: (id, delta) => mutate((e) => moveLine(e, id, delta)),
    patchNote: (patch) => {
      if (selectedIds.length > 0) mutate((e) => selectedIds.reduce((acc, id) => editNote(acc, id, patch), e));
    },
    removeNote: () => {
      if (selectedIds.length === 0) return;
      mutate((e) => selectedIds.reduce((acc, id) => editNote(acc, id, { deleted: true }), e));
      setSelectedIds([]);
      announce(t("edit.live.noteDeleted"));
    },
    copyNote: () => {
      if (!selected) return;
      const made = addNote(edits, {
        time: selected.time + Math.max(0.05, selected.duration),
        duration: selected.duration,
        midi: selected.midi,
        velocity: selected.velocity,
        lineId: selectedLine,
      });
      mutate(() => made.edits);
      setSelectedIds([made.id]);
      announce(t("edit.live.noteAdded"));
    },
    restoreNote: () => {
      if (selectedIds.length > 0) mutate((e) => selectedIds.reduce((acc, id) => resetNote(acc, id), e));
    },
    addNoteAt: () => {
      if (!scene) return;
      const made = addNote(edits, {
        time: scene.clock.now() + 1, // one second ahead: inside the staff's look-ahead window
        duration: 0.5,
        midi: 64,
        velocity: 0.7,
        lineId: selectedLine,
      });
      mutate(() => made.edits);
      setSelectedIds([made.id]);
      announce(t("edit.live.noteAdded"));
    },
    playSelected: () => handle?.editCommand({ type: "play" }),
  };
}
