import type { Template } from '@/templates/generated';
import { STOCK_RECIPES } from '@/xr/shapes/stock-recipes';

/** Undo / redo of one recipe and its diff against the stock object. Pure (no React). */

export type Recipe = Template['recipes'][number];

export const OBJECT_HISTORY_LIMIT = 100;

export interface ObjectHistory {
  readonly past: readonly Recipe[];
  readonly future: readonly Recipe[];
}

export const EMPTY_HISTORY: ObjectHistory = { past: [], future: [] };

/** Records `current` before it is replaced by an edit; a new edit clears the redo list. */
export function record(h: ObjectHistory, current: Recipe): ObjectHistory {
  return { past: [...h.past, current].slice(-OBJECT_HISTORY_LIMIT), future: [] };
}

export function undoStep(h: ObjectHistory, current: Recipe): { history: ObjectHistory; recipe: Recipe } | null {
  const previous = h.past.at(-1);
  if (!previous) return null;
  return { history: { past: h.past.slice(0, -1), future: [current, ...h.future] }, recipe: previous };
}

export function redoStep(h: ObjectHistory, current: Recipe): { history: ObjectHistory; recipe: Recipe } | null {
  const [next, ...rest] = h.future;
  if (!next) return null;
  return { history: { past: [...h.past, current], future: rest }, recipe: next };
}

/** The stock recipe a recipe was copied from (`house`, `house_2` -> `house`), or null. */
export function stockOf(recipe: Recipe): Recipe | null {
  const base = recipe.name.replace(/_\d+$/, '');
  const stock = STOCK_RECIPES.find((r) => r.name === base);
  return stock ? (stock as unknown as Recipe) : null;
}

export interface RecipeDiff {
  readonly added: number;
  readonly removed: number;
  readonly changed: number;
  readonly variants: number;
}

/** Parts added, removed or changed (by id) against a reference, and the difference in variant count. */
export function diffRecipe(reference: Recipe, current: Recipe): RecipeDiff {
  const ref = new Map((reference.nodes ?? []).map((n) => [n.id, JSON.stringify(n)]));
  const now = new Map((current.nodes ?? []).map((n) => [n.id, JSON.stringify(n)]));
  let added = 0;
  let changed = 0;
  for (const [id, json] of now) {
    const before = ref.get(id);
    if (before === undefined) added += 1;
    else if (before !== json) changed += 1;
  }
  const removed = [...ref.keys()].filter((id) => !now.has(id)).length;
  const variants = JSON.stringify(current.variants ?? []) === JSON.stringify(reference.variants ?? []) ? 0 : 1;
  return { added, removed, changed, variants };
}

export const isUnchanged = (d: RecipeDiff): boolean => d.added + d.removed + d.changed + d.variants === 0;

/** Same recipe with the reference's nodes and variants (name, budget and scale are kept). */
export function resetTo(current: Recipe, reference: Recipe): Recipe {
  return { ...current, nodes: structuredClone(reference.nodes ?? []), variants: structuredClone(reference.variants ?? []) };
}
