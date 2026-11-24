import { useT } from '@/i18n';

interface ReasonListProps {
  reasons: readonly string[];
}

const KNOWN = ['offensive', 'spam', 'broken', 'copyright'] as const;

/** Report reasons as plain text (closed list of codes; anything unknown is not rendered). */
export function ReasonList({ reasons }: ReasonListProps) {
  const t = useT('moderation');
  return (
    <ul className="flex flex-wrap gap-1 text-xs" aria-label={t('reasons')}>
      {reasons.flatMap((reason, index) =>
        KNOWN.includes(reason as (typeof KNOWN)[number])
          ? [
              <li key={`${reason}-${index}`} className="rounded-full bg-white/10 px-2 py-0.5">
                {t(`reason.${reason as (typeof KNOWN)[number]}`)}
              </li>,
            ]
          : [],
      )}
    </ul>
  );
}
