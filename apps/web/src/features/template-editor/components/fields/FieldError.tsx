'use client';

import { useT } from '@/i18n';
import type { EditorError } from '../../lib/editor-validate';

/** The first error of a field, linked to its control through `id` / `aria-describedby`. */
export function FieldError({ id, error }: { id: string; error: EditorError | undefined }) {
  const t = useT('editor');
  if (!error) return null;
  return (
    <p id={id} role="alert" className="text-xs text-[var(--mw-accent)]">
      {t(`error.${error.code}`)}
    </p>
  );
}
