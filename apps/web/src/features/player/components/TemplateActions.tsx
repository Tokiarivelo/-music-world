"use client";

import { useSession } from "@/features/auth";
import { EditCopyLink, PublishTemplateButton } from "@/features/template-store";
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
  const publishable = generatedHere && session.status !== "loading";
  return (
    <div className="flex flex-col gap-1">
      <EditCopyLink template={template} />
      {publishable && (
        <PublishTemplateButton
          template={template}
          signedIn={session.user !== null}
        />
      )}
    </div>
  );
}
