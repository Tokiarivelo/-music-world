'use client';

import Link from 'next/link';
import { useT } from '@/i18n';
import { HANDOFF_KEY, stashTemplate } from '@/lib/template-stash';
import { BUILTIN_TEMPLATES } from '@/templates/default';
import type { Template } from '@/templates/generated';

interface EditCopyLinkProps {
  template: Template;
  className?: string;
}

const EDITOR_ROUTE = '/editor';

/** "Edit a copy": a built-in template opens by id; any other (store, AI-generated) is handed over in `sessionStorage`. */
export function EditCopyLink({ template, className }: EditCopyLinkProps) {
  const t = useT('editor');
  const builtin = BUILTIN_TEMPLATES.some((b) => b.id === template.id);
  const href = builtin ? `${EDITOR_ROUTE}?from=${encodeURIComponent(template.id)}` : `${EDITOR_ROUTE}?from=session`;
  return (
    <Link className={className ?? 'text-sm underline'} href={href} onClick={() => !builtin && stashTemplate(template, HANDOFF_KEY)}>
      {t('editCopy')}
    </Link>
  );
}
