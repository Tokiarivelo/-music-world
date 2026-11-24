import { useT } from '@/i18n';
import type { Job } from '@/templates/generated';
import { percent, stageViews } from '../lib/stage-progress';

const STATE_CLASS = {
  done: 'text-[var(--mw-secondary)]',
  active: 'text-[var(--mw-accent)] font-medium',
  pending: 'opacity-50',
} as const;

const STATE_MARK = { done: '✓', active: '…', pending: '·' } as const;

export function AnalysisProgress({ job }: { job: Job | null }) {
  const t = useT('upload');
  const value = percent(job?.progress ?? 0);
  const stages = stageViews(job?.stage ?? null, job?.status ?? 'queued');
  return (
    <section aria-live="polite" className="w-full space-y-4">
      <h2 className="text-lg font-medium">{t('analysing')}</h2>
      <div
        role="progressbar"
        aria-label={t('progressLabel')}
        aria-valuemin={0}
        aria-valuemax={100}
        aria-valuenow={value}
        className="h-2 w-full overflow-hidden rounded-full bg-white/10"
      >
        <div
          className="h-full bg-gradient-to-r from-[var(--mw-primary)] via-[var(--mw-accent)] to-[var(--mw-secondary)] transition-[width]"
          style={{ width: `${value}%` }}
        />
      </div>
      <ol className="space-y-1 text-left text-sm">
        {stages.map((s) => (
          <li key={s.id} data-state={s.state} className={STATE_CLASS[s.state]}>
            <span aria-hidden="true" className="inline-block w-5">
              {STATE_MARK[s.state]}
            </span>
            {t(`stage.${s.id}`)}
          </li>
        ))}
      </ol>
    </section>
  );
}
