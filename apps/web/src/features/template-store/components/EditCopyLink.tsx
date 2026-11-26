'use client';

import Link from 'next/link';
import { Pencil } from 'lucide-react';
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
    <Link
      className={
        className ??
        'inline-flex h-7 w-7 items-center justify-center rounded-full bg-violet-600/30 text-violet-300 border border-violet-500/40 hover:bg-violet-600 hover:text-white hover:scale-105 active:scale-95 transition-all shadow-sm'
      }
      href={href}
      title={t('editCopy')}
      aria-label={t('editCopy')}
      onClick={() => !builtin && stashTemplate(template, HANDOFF_KEY)}
    >
      <Pencil className="h-3.5 w-3.5" aria-hidden="true" />
      <span className="sr-only">{t('editCopy')}</span>
    </Link>
  );
}
