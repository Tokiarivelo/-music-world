"use client";

import { useEffect } from "react";
import type { WorldHandle } from "@/xr/world-host";
import type { NoteEditsApi } from "./use-note-edits";

function typing(target: EventTarget | null): boolean {
  const el = target as HTMLElement | null;
  return !!el && (el.tagName === "INPUT" || el.tagName === "SELECT" || el.tagName === "TEXTAREA" || el.isContentEditable);
}

/** Keyboard operation of the note editor (requirement 11): Tab / arrows select, Up / Down move, Enter plays. */
export function useEditShortcuts(handle: WorldHandle | null, api: NoteEditsApi): void {
  const { enabled, undo, redo, removeNote, copySelection, paste } = api;
  useEffect(() => {
    if (!handle || !enabled) return;
    const onKey = (e: KeyboardEvent): void => {
      if (typing(e.target)) return;
      const mod = e.ctrlKey || e.metaKey;
      if (mod && e.key.toLowerCase() === "z") {
        e.preventDefault();
        if (e.shiftKey) redo();
        else undo();
      } else if (mod && e.key.toLowerCase() === "c") {
        copySelection();
      } else if (mod && e.key.toLowerCase() === "v") {
        e.preventDefault();
        paste();
      } else if (mod && e.key.toLowerCase() === "y") {
        e.preventDefault();
        redo();
      } else if (e.key === "ArrowRight" || (e.key === "Tab" && !e.shiftKey)) {
        e.preventDefault();
        handle.editCommand({ type: "select", direction: 1 });
      } else if (e.key === "ArrowLeft" || (e.key === "Tab" && e.shiftKey)) {
        e.preventDefault();
        handle.editCommand({ type: "select", direction: -1 });
      } else if (e.key === "ArrowUp") {
        e.preventDefault();
        handle.editCommand({ type: "nudge", steps: 1 });
      } else if (e.key === "ArrowDown") {
        e.preventDefault();
        handle.editCommand({ type: "nudge", steps: -1 });
      } else if (e.key === "Enter") {
        handle.editCommand({ type: "play" });
      } else if (e.key === "Delete" || e.key === "Backspace") {
        removeNote();
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [handle, enabled, undo, redo, removeNote, copySelection, paste]);
}
