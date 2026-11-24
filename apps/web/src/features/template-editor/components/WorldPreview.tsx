'use client';

import { PreviewPlayback } from '@/features/player';
import { PREVIEW_DEBOUNCE_MS } from '../consts/ui.consts';
import { useDebouncedValue } from '../hooks/use-debounced-value';
import type { DraftState } from '../interfaces/template-editor.types';

/** The world of the demo song (or `?project=`) with the last **valid** draft, debounced; audio and time are untouched. */
export function WorldPreview({ state, projectId }: { state: Pick<DraftState, 'lastValid'>; projectId: string | null }) {
  const template = useDebouncedValue(state.lastValid, PREVIEW_DEBOUNCE_MS);
  return <PreviewPlayback template={template} projectId={projectId} />;
}
