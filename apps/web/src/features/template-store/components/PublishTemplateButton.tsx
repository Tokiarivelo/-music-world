'use client';

import Link from 'next/link';
import type { Template } from '@/templates/generated';
import { useT } from '@/i18n';
import { STORE_ROUTES } from '../consts/template-store.consts';
import { usePublishTemplate, type PublishApi } from '../hooks/use-publish-template';

interface PublishTemplateButtonProps {
  template: Template;
  signedIn: boolean;
  /** Injected in tests; defaults to the store API. */
  api?: PublishApi;
}

/** "Publish to the store" for the template the world renders; signed-out users get a sign-in link. */
export function PublishTemplateButton({ template, signedIn, api }: PublishTemplateButtonProps) {
  const t = useT('store');
  const { status, errorKey, publishedIds, publish } = usePublishTemplate(api);
  if (!signedIn) {
    return (
      <Link className="text-sm underline" href={STORE_ROUTES.signIn}>
        {t('signInToPublish')}
      </Link>
    );
  }
  if (publishedIds.includes(template.id)) {
    return (
      <p role="status" className="text-sm">
        {t('published')} ·{' '}
        <Link className="underline" href={STORE_ROUTES.gallery}>
          {t('viewStore')}
        </Link>
      </p>
    );
  }
  return (
    <div className="flex flex-col gap-1 text-sm">
      <button
        type="button"
        onClick={() => publish(template)}
        disabled={status === 'publishing'}
        className="rounded border border-[var(--mw-secondary)] px-3 py-1 disabled:opacity-50"
      >
        {status === 'publishing' ? t('publishing') : t('publish')}
      </button>
      {status === 'error' && (
        <p role="alert" className="text-[var(--mw-accent)]">
          {t.error(errorKey)}
        </p>
      )}
    </div>
  );
}
