import type { Template } from '@/templates/generated';
import type { DraftState } from '../interfaces/template-editor.types';
import { copyOf } from '../lib/editor-model';
import { validateTemplate, type EditorError } from '../lib/editor-validate';

export interface DraftStore {
  getState(): DraftState;
  subscribe(listener: () => void): () => void;
  /** Applies a pure update of `editor-model` to the draft and revalidates. */
  update(change: (draft: Template) => Template): void;
  /** Replaces the draft with a saved or restored document (not dirty). */
  replace(draft: Template, draftId?: string | null): void;
  /** Back to a fresh copy of the source. */
  reset(): void;
  /** Records the id of the server draft after a save (`null` after a publication: the next save is a new draft). */
  markSaved(draftId: string | null): void;
  /** Adds server-reported errors (mapped paths) until the next change. */
  reject(errors: readonly EditorError[]): void;
}

function stateOf(source: Template, draft: Template, draftId: string | null, dirty: boolean, previous?: DraftState): DraftState {
  const errors = validateTemplate(draft);
  const lastValid = errors.length === 0 ? draft : (previous?.lastValid ?? source);
  return { source, draft, errors, lastValid, draftId, dirty };
}

/** The editor's draft: a small external store (no extra dependency), read with `useTemplateDraft`. */
export function createDraftStore(source: Template, initial: Template = copyOf(source)): DraftStore {
  let state = stateOf(source, initial, null, false);
  const listeners = new Set<() => void>();
  const set = (next: DraftState): void => {
    state = next;
    listeners.forEach((l) => l());
  };
  return {
    getState: () => state,
    subscribe(listener) {
      listeners.add(listener);
      return () => listeners.delete(listener);
    },
    update(change) {
      const draft = change(state.draft);
      if (draft === state.draft) return;
      set(stateOf(state.source, draft, state.draftId, true, state));
    },
    replace(draft, draftId = null) {
      set(stateOf(state.source, draft, draftId, false, state));
    },
    reset() {
      set(stateOf(state.source, copyOf(state.source), null, false));
    },
    markSaved(draftId) {
      set({ ...state, draftId, dirty: false });
    },
    reject(errors) {
      set({ ...state, errors: [...state.errors, ...errors] });
    },
  };
}
