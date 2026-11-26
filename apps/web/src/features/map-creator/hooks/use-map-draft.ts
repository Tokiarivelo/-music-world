'use client';

import { useCallback, useState } from 'react';
import type { Template } from '@/templates/generated';
import { canRedo, canUndo, commit, redo, startHistory, undo, type History } from '../lib/history';

export interface MapDraft {
  readonly template: Template | null;
  /** Replaces the map (new or reopened): history restarts. */
  open(template: Template | null): void;
  /** Applies one undoable change. */
  apply(change: (t: Template) => Template): void;
  /** Sets the map as one undoable step (the end of a drag). */
  set(next: Template): void;
  undo(): void;
  redo(): void;
  readonly canUndo: boolean;
  readonly canRedo: boolean;
}

/** The map being edited with its undo / redo history (null until a map is created or reopened). */
export function useMapDraft(initial: Template | null = null): MapDraft {
  const [history, setHistory] = useState<History<Template | null>>(() => startHistory(initial));
  const open = useCallback((t: Template | null) => setHistory(startHistory(t)), []);
  const apply = useCallback((change: (t: Template) => Template) => setHistory((h) => (h.present ? commit(h, change(h.present)) : h)), []);
  const set = useCallback((next: Template) => setHistory((h) => commit(h, next)), []);
  return {
    template: history.present,
    open,
    apply,
    set,
    undo: useCallback(() => setHistory((h) => undo(h)), []),
    redo: useCallback(() => setHistory((h) => redo(h)), []),
    canUndo: canUndo(history),
    canRedo: canRedo(history),
  };
}
