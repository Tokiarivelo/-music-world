import type { Template } from '@/templates/generated';
import type { EditorError } from '../lib/editor-validate';

/** What every form section receives: the draft, the errors and the pure-update entry point of the store. */
export interface SectionProps {
  draft: Template;
  errors: readonly EditorError[];
  update(change: (draft: Template) => Template): void;
}
