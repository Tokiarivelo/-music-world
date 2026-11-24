'use client';

import { useEffect, useMemo } from 'react';
import type { DirectorState } from '@/features/director';
import { BUILTIN_TEMPLATES } from '@/templates/default';
import { useTemplateChoice, type TemplateChoiceState } from './use-template-choice';

/** Built-in templates plus every AI-generated one (2D page and VR picker); each new generation is selected. */
export function useAiTemplateChoice(director: DirectorState): TemplateChoiceState {
  const templates = useMemo(() => [...BUILTIN_TEMPLATES, ...director.templates], [director.templates]);
  const choice = useTemplateChoice(templates);
  const { selectTemplate } = choice;
  const latestId = director.latest?.template.id ?? null;
  const { results } = director;
  useEffect(() => {
    if (latestId !== null) selectTemplate(latestId);
  }, [latestId, results, selectTemplate]);
  return choice;
}
