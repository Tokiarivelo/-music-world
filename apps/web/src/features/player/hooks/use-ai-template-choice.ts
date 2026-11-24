'use client';

import { useEffect, useMemo, useRef } from 'react';
import type { DirectorState } from '@/features/director';
import type { Template } from '@/templates/generated';
import { BUILTIN_TEMPLATES } from '@/templates/default';
import { useTemplateChoice, type TemplateChoiceState } from './use-template-choice';

export interface StoreChoice {
  templates: readonly Template[];
  /** Template id to select once it is available (`?template=<store id>`). */
  requestedTemplateId: string | null;
}

const NO_STORE: StoreChoice = { templates: [], requestedTemplateId: null };

/** Built-ins, then store templates, then every AI-generated one (2D page and VR picker); each new generation and the
 * requested store template are selected. Ids are unique: a later duplicate is dropped. */
export function useAiTemplateChoice(director: DirectorState, store: StoreChoice = NO_STORE): TemplateChoiceState {
  const templates = useMemo(() => {
    const seen = new Set<string>();
    return [...BUILTIN_TEMPLATES, ...store.templates, ...director.templates].filter((t) => {
      if (seen.has(t.id)) return false;
      seen.add(t.id);
      return true;
    });
  }, [store.templates, director.templates]);
  const choice = useTemplateChoice(templates);
  const { selectTemplate } = choice;
  const latestId = director.latest?.template.id ?? null;
  const { results } = director;
  const handledResults = useRef<DirectorState['results'] | null>(null);
  useEffect(() => {
    // Only a new generation selects a template, not a later change of the list (store templates arriving).
    if (latestId === null || handledResults.current === results) return;
    handledResults.current = results;
    selectTemplate(latestId);
  }, [latestId, results, selectTemplate]);
  const requested = store.requestedTemplateId;
  const selectedRequest = useRef<string | null>(null);
  useEffect(() => {
    if (requested === null || selectedRequest.current === requested) return;
    if (!templates.some((t) => t.id === requested)) return;
    selectedRequest.current = requested; // once: the user may pick another template afterwards
    selectTemplate(requested);
  }, [requested, templates, selectTemplate]);
  return choice;
}
