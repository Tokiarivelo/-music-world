'use client';

import { useT } from '@/i18n';
import { BUTTON } from '../consts/ui.consts';
import { diffRecipe, isUnchanged, stockOf, type Recipe } from '../lib/object-history';

export interface ObjectHistoryBarProps {
  recipe: Recipe;
  opening: Recipe | null;
  canUndo: boolean;
  canRedo: boolean;
  onUndo(): void;
  onRedo(): void;
  onReset(reference: Recipe): void;
}

/** Undo, redo, reset to stock (or to how the object was opened) and a one-line diff against that reference. */
export function ObjectHistoryBar({ recipe, opening, canUndo, canRedo, onUndo, onRedo, onReset }: ObjectHistoryBarProps) {
  const t = useT('editor');
  const stock = stockOf(recipe);
  const reference = stock ?? opening;
  const diff = reference ? diffRecipe(reference, recipe) : null;
  return (
    <div className="flex flex-wrap items-center gap-2" role="toolbar" aria-label={t('history.label')}>
      <button type="button" className={BUTTON} disabled={!canUndo} onClick={onUndo}>
        {t('history.undo')}
      </button>
      <button type="button" className={BUTTON} disabled={!canRedo} onClick={onRedo}>
        {t('history.redo')}
      </button>
      <button type="button" className={BUTTON} disabled={!reference || !diff || isUnchanged(diff)} onClick={() => reference && onReset(reference)}>
        {t(stock ? 'history.resetStock' : 'history.resetOpening')}
      </button>
      {diff && (
        <span className="text-xs opacity-80" role="status">
          {isUnchanged(diff)
            ? t('history.same')
            : t('history.diff', { added: diff.added, removed: diff.removed, changed: diff.changed, variants: diff.variants })}
        </span>
      )}
    </div>
  );
}
