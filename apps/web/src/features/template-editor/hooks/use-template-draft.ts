'use client';

import { useSyncExternalStore } from 'react';
import type { DraftState } from '../interfaces/template-editor.types';
import type { DraftStore } from '../store/template-draft.store';

export function useTemplateDraft(store: DraftStore): DraftState {
  return useSyncExternalStore(store.subscribe, store.getState, store.getState);
}
