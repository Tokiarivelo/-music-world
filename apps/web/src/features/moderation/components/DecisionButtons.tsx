import { useT } from '@/i18n';
import type { Decision } from '../consts/moderation.consts';

interface DecisionButtonsProps {
  disabled: boolean;
  onDecide(decision: Decision): void;
}

/** Restore (publish again) or remove (delete for good). */
export function DecisionButtons({ disabled, onDecide }: DecisionButtonsProps) {
  const t = useT('moderation');
  return (
    <div className="flex gap-2 text-sm">
      <button
        type="button"
        disabled={disabled}
        onClick={() => onDecide('restore')}
        className="rounded-full bg-[var(--mw-primary)] px-4 py-1.5 font-medium text-black disabled:opacity-50"
      >
        {t('restore')}
      </button>
      <button
        type="button"
        disabled={disabled}
        onClick={() => onDecide('remove')}
        className="rounded-full border border-white/30 px-4 py-1.5 disabled:opacity-50"
      >
        {t('remove')}
      </button>
    </div>
  );
}
