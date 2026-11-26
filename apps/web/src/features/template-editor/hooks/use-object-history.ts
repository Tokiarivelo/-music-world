'use client';

import { useCallback, useState } from 'react';
import type { Template } from '@/templates/generated';
import { EMPTY_HISTORY, record, redoStep, resetTo, undoStep, type ObjectHistory, type Recipe } from '../lib/object-history';

type Update = (change: (d: Template) => Template) => void;

/** Undo / redo for the recipe at `index`. Edits made through `edit` are recorded; the opening state is kept for reset. */
export function useObjectHistory(draft: Template, index: number, update: Update) {
  const [history, setHistory] = useState<ObjectHistory>(EMPTY_HISTORY);
  const [opening] = useState<Recipe | null>(() => draft.recipes[index] ?? null);
  const current = draft.recipes[index] ?? null;

  const put = useCallback((recipe: Recipe) => update((d) => ({ ...d, recipes: d.recipes.map((r, i) => (i === index ? recipe : r)) })), [update, index]);

  const edit = useCallback(
    (change: (d: Template) => Template) => {
      if (current) setHistory((h) => record(h, current));
      update(change);
    },
    [current, update],
  );
  const undo = useCallback(() => {
    const step = current && undoStep(history, current);
    if (!step) return;
    setHistory(step.history);
    put(step.recipe);
  }, [current, history, put]);
  const redo = useCallback(() => {
    const step = current && redoStep(history, current);
    if (!step) return;
    setHistory(step.history);
    put(step.recipe);
  }, [current, history, put]);
  const reset = useCallback(
    (reference: Recipe) => {
      if (!current) return;
      setHistory((h) => record(h, current));
      put(resetTo(current, reference));
    },
    [current, put],
  );
  return { edit, undo, redo, reset, canUndo: history.past.length > 0, canRedo: history.future.length > 0, opening };
}
