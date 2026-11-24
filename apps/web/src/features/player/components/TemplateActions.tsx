"use client";

import { useSession } from "@/features/auth";
import { PublishTemplateButton } from "@/features/template-store";
import type { Template } from "@/templates/generated";

interface TemplateActionsProps {
  template: Template;
  /** True when the template was generated in this session (store templates are already published). */
  generatedHere: boolean;
}

/** Store actions for the rendered template: an AI-generated world can be published (requirement 3.5). */
export function TemplateActions({
  template,
  generatedHere,
}: TemplateActionsProps) {
  const session = useSession();
  if (!generatedHere || session.status === "loading") return null;
  return (
    <PublishTemplateButton
      template={template}
      signedIn={session.user !== null}
    />
  );
}
