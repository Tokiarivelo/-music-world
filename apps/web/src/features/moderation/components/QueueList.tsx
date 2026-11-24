import { TemplatePreview } from '@/features/template-store';
import { useT } from '@/i18n';
import type { QueueItem } from '../api/moderation.api';
import type { Decision } from '../consts/moderation.consts';
import { DecisionButtons } from './DecisionButtons';
import { ReasonList } from './ReasonList';

interface QueueListProps {
  items: readonly QueueItem[];
  pending: string | null;
  onDecide(storeId: string, decision: Decision): void;
}

/** One card per hidden template: preview, name, author, report count, reasons and the two decisions. */
export function QueueList({ items, pending, onDecide }: QueueListProps) {
  const t = useT('moderation');
  return (
    <ul className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
      {items.map((item) => {
        const { template } = item.template;
        return (
          <li key={item.template.id} className="flex flex-col gap-2 rounded-lg border border-white/10 bg-white/5 p-3">
            <TemplatePreview template={template} />
            <h2 className="font-semibold">{template.name}</h2>
            <p className="text-xs opacity-80">
              {t('by', { author: item.template.author.displayName })} · {t('reports', { count: item.reportCount })}
            </p>
            <ReasonList reasons={item.reasons} />
            <DecisionButtons disabled={pending !== null} onDecide={(d) => onDecide(item.template.id, d)} />
          </li>
        );
      })}
    </ul>
  );
}
