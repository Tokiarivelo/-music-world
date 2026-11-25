'use client';

import { useT } from '@/i18n';
import { useTour } from '../hooks/use-tour';

const BUTTON = 'rounded-full px-4 py-1.5 text-sm font-medium focus-visible:outline focus-visible:outline-2';

/** Short first-visit tour of the demo world, plus a small button to see it again. Not modal: the world stays usable. */
export function GuidedTour() {
  const t = useT('common');
  const tour = useTour();
  if (tour.step === null) {
    return (
      <button
        className={`${BUTTON} absolute bottom-24 right-3 z-10 border border-white/40 bg-[var(--mw-bg)]/80`}
        onClick={tour.restart}
        type="button"
      >
        {t('tour.again')}
      </button>
    );
  }
  const last = tour.index + 1 === tour.total;
  return (
    <section
      aria-labelledby="mw-tour-title"
      className="absolute inset-x-3 bottom-28 z-20 mx-auto max-w-sm rounded-xl border border-white/30 bg-[var(--mw-bg)]/95 p-4 shadow-xl"
      role="dialog"
    >
      <p className="text-xs opacity-70">{t('tour.progress', { current: tour.index + 1, total: tour.total })}</p>
      <h2 className="mt-1 text-base font-semibold text-[var(--mw-primary)]" id="mw-tour-title">
        {t(`tour.${tour.step}.title`)}
      </h2>
      <p className="mt-1 text-sm">{t(`tour.${tour.step}.body`)}</p>
      <div className="mt-3 flex justify-between gap-2">
        <button className={`${BUTTON} border border-white/40`} onClick={tour.close} type="button">
          {t('tour.skip')}
        </button>
        <button className={`${BUTTON} bg-[var(--mw-secondary)]`} onClick={tour.next} type="button">
          {t(last ? 'tour.done' : 'tour.next')}
        </button>
      </div>
    </section>
  );
}
