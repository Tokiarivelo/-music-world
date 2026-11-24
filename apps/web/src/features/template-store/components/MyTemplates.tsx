'use client';

import Link from 'next/link';
import { useT } from '@/i18n';
import type { StoreTemplate } from '@/templates/generated';
import { STORE_ROUTES } from '../consts/template-store.consts';
import { useMyTemplates } from '../hooks/use-my-templates';
import { TemplatePreview } from './TemplatePreview';

interface MyTemplatesProps {
  /** Injected in tests; defaults to `GET /api/templates/mine`. */
  list?: () => Promise<StoreTemplate[]>;
}

/** "My templates": every template of the signed-in user with its status; hidden ones say they are under review. */
export function MyTemplates({ list }: MyTemplatesProps) {
  const t = useT('store');
  const { status, errorKey, items } = useMyTemplates(list);
  if (status === 'ready' && items.length === 0) return null;
  return (
    <section className="flex flex-col gap-3" aria-labelledby="my-templates-title">
      <h2 id="my-templates-title" className="text-xl font-semibold">
        {t('mine.title')}
      </h2>
      {status === 'loading' && <p>{t('loading')}</p>}
      {status === 'error' && (
        <p role="alert" className="text-[var(--mw-accent)]">
          {t.error(errorKey)}
        </p>
      )}
      <ul className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
        {items.map((item) => (
          <li key={item.id} className="flex flex-col gap-2 rounded-lg border border-white/10 bg-white/5 p-3">
            <TemplatePreview template={item.template} />
            <h3 className="font-semibold">{item.template.name}</h3>
            <p className="text-xs opacity-80">{t(`mine.status.${item.status}`)}</p>
            {item.status === 'hidden' && (
              <p className="text-xs text-[var(--mw-accent)]">{t('mine.hiddenNotice')}</p>
            )}
            {item.status === 'published' && (
              <Link
                className="mt-auto rounded-full bg-[var(--mw-primary)] px-4 py-2 text-center text-sm font-medium text-black"
                href={STORE_ROUTES.play(item.id)}
              >
                {t('use')}
              </Link>
            )}
          </li>
        ))}
      </ul>
    </section>
  );
}
