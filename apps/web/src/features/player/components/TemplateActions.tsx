'use client';

import { useSession } from '@/features/auth';
import { PublishTemplateButton } from '@/features/template-store';
import type { Template } from '@/templates/generated';

interface TemplateActionsProps {
  template: Template;
}

/** Store actions for the rendered template: an AI-generated world can be published (requirement 3.5). */
export function TemplateActions({ template }: TemplateActionsProps) {
  const session = useSession();
  if (!template.meta?.generatedBy || session.status === 'loading') return null;
  return <PublishTemplateButton template={template} signedIn={session.user !== null} />;
}
