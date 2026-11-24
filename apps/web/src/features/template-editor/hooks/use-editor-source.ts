'use client';

import { useEffect, useState } from 'react';
import { getStoreTemplate } from '@/features/template-store';
import { BUILTIN_TEMPLATES, DEFAULT_TEMPLATE } from '@/templates/default';
import type { Template } from '@/templates/generated';
import { validateTemplate } from '../lib/editor-validate';
import { HANDOFF_KEY, readStashedTemplate } from '@/lib/template-stash';

export type SourceState =
  | { status: 'loading' }
  | { status: 'ready'; source: Template }
  | { status: 'error'; errorKey: string };

export interface EditorSourceApi {
  getStoreTemplate(id: string): Promise<{ template: Template }>;
  readStashed(): Template | null;
}

/** `?from=session`: the template an "Edit a copy" entry point handed over (overwritten by the next handoff). */
export const FROM_SESSION = 'session';

const DEFAULT_API: EditorSourceApi = { getStoreTemplate, readStashed: () => readStashedTemplate(HANDOFF_KEY) };

/**
 * The template to start from: the default look without `from`, a built-in or store template by id, or the one an
 * entry point stashed (`from=session`). A failure is reported so the page can offer the default template.
 */
export function useEditorSource(from: string | null, api: EditorSourceApi = DEFAULT_API): SourceState & { fallbackToDefault(): void } {
  const [state, setState] = useState<SourceState>(from === null ? { status: 'ready', source: DEFAULT_TEMPLATE } : { status: 'loading' });
  useEffect(() => {
    let alive = true;
    const ready = (source: Template): void => {
      if (!alive) return;
      setState(validateTemplate(source).length === 0 ? { status: 'ready', source } : { status: 'error', errorKey: 'INVALID' });
    };
    const fail = (errorKey: string): void => {
      if (alive) setState({ status: 'error', errorKey });
    };
    if (from === null) ready(DEFAULT_TEMPLATE);
    else if (from === FROM_SESSION) {
      const stashed = api.readStashed();
      if (stashed) ready(stashed);
      else fail('NOT_FOUND');
    } else {
      const builtin = BUILTIN_TEMPLATES.find((t) => t.id === from);
      if (builtin) ready(builtin);
      else {
        api.getStoreTemplate(from).then((stored) => ready(stored.template), () => fail('NOT_FOUND'));
      }
    }
    return () => {
      alive = false;
    };
  }, [from, api]);
  return { ...state, fallbackToDefault: () => setState({ status: 'ready', source: DEFAULT_TEMPLATE }) };
}
