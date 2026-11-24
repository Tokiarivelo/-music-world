import type { Template } from '@/templates/generated';
import type { EditorError } from '../lib/editor-validate';

export interface DraftState {
  /** The template the editor was opened from; never modified. */
  source: Template;
  /** The working copy. */
  draft: Template;
  /** Validation errors of `draft` (empty when it can be saved). */
  errors: readonly EditorError[];
  /** The last valid version of `draft`: what the preview shows while the draft is invalid. */
  lastValid: Template;
  /** Id of the saved draft on the server once saved (later saves replace it). */
  draftId: string | null;
  /** True when `draft` differs from the last saved or loaded state. */
  dirty: boolean;
}
