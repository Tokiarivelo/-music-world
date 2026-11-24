'use client';

import { useT } from '@/i18n';
import { useModerationQueue, type ModerationApi } from '../hooks/use-moderation-queue';
import { QueueList } from './QueueList';

interface ModerationPageProps {
  /** Injected in tests; defaults to `/api/moderation`. */
  api?: ModerationApi;
}

/** The review queue of reported (hidden) templates. */
export function ModerationPage({ api }: ModerationPageProps) {
  const t = useT('moderation');
  const queue = useModerationQueue(api);
  return (
    <section className="flex flex-col gap-4">
      <h1 className="text-2xl font-semibold">{t('title')}</h1>
      <p className="text-sm opacity-80">{t('intro')}</p>
      {queue.errorKey && (
        <p role="alert" className="text-[var(--mw-accent)]">
          {t.error(queue.errorKey)}
        </p>
      )}
      {queue.status === 'loading' && <p>{t('loading')}</p>}
      {queue.status === 'ready' && queue.items.length === 0 && <p>{t('empty')}</p>}
      {queue.items.length > 0 && <QueueList items={queue.items} pending={queue.pending} onDecide={queue.decide} />}
      {queue.hasMore && (
        <button type="button" onClick={queue.loadMore} className="self-center rounded-full border border-white/30 px-4 py-2">
          {t('more')}
        </button>
      )}
    </section>
  );
}
