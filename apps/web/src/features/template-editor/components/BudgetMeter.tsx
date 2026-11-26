'use client';

import { useT } from '@/i18n';
import type { Template } from '@/templates/generated';
import { drawCallEstimate, liveTriangles, MAX_DRAW_CALLS } from '../lib/budget-model';
import type { Recipe } from '../lib/recipe-model';

/** Live triangle and draw-call budgets of the object being edited; red when over (saving is then refused). */
export function BudgetMeter({ draft, recipe }: { draft: Template; recipe: Recipe }) {
  const t = useT('editor');
  const triangles = liveTriangles(recipe, draft.palette);
  const max = recipe.budget.maxTriangles;
  const calls = drawCallEstimate(draft);
  const row = (label: string, value: number, limit: number) => (
    <div className="flex items-center gap-2 text-xs" role="status">
      <span className={value > limit ? 'font-semibold text-red-400' : ''}>
        {label}: {value} / {limit}
      </span>
      <meter className="h-1.5 w-24" min={0} max={limit} value={Math.min(value, limit)} aria-label={label} />
    </div>
  );
  return (
    <div className="flex flex-col gap-1">
      {row(t('budget.triangles'), triangles, max)}
      {row(t('budget.drawCalls'), calls, MAX_DRAW_CALLS)}
    </div>
  );
}
