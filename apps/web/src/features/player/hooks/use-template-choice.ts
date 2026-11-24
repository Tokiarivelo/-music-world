'use client';

import { useCallback, useMemo, useState } from 'react';
import type { Template } from '@/templates/generated';
import { BUILTIN_TEMPLATES } from '@/templates/default';

export interface TemplateChoiceState {
  template: Template;
  templates: readonly Template[];
  selectTemplate(id: string): void;
}

/** The template rendered by the play page and the choices of the VR template picker (07-xr-mode requirement 4.3). */
export function useTemplateChoice(templates: readonly Template[] = BUILTIN_TEMPLATES): TemplateChoiceState {
  const [templateId, setTemplateId] = useState(templates[0]!.id);
  const template = useMemo(() => templates.find((t) => t.id === templateId) ?? templates[0]!, [templates, templateId]);
  const selectTemplate = useCallback(
    (id: string) => {
      if (templates.some((t) => t.id === id)) setTemplateId(id);
    },
    [templates],
  );
  return { template, templates, selectTemplate };
}
