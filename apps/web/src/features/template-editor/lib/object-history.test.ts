import { describe, expect, it } from 'vitest';
import { STOCK_RECIPES } from '@/xr/shapes/stock-recipes';
import { diffRecipe, EMPTY_HISTORY, isUnchanged, record, redoStep, resetTo, stockOf, undoStep, type Recipe } from './object-history';

const house = { ...structuredClone(STOCK_RECIPES.find((r) => r.name === 'house')!), name: 'house_2' } as unknown as Recipe;

describe('object history', () => {
  it('undoes and redoes, and a new edit clears redo', () => {
    const a = { ...house, footprint: 0.3 } as Recipe;
    let h = record(EMPTY_HISTORY, house);
    const u = undoStep(h, a)!;
    expect(u.recipe).toBe(house);
    h = u.history;
    expect(redoStep(h, house)!.recipe).toBe(a);
    expect(record(h, house).future).toEqual([]);
    expect(undoStep(EMPTY_HISTORY, a)).toBeNull();
  });
  it('finds the stock of a copy and diffs against it', () => {
    const stock = stockOf(house)!;
    expect(isUnchanged(diffRecipe(stock, house))).toBe(true);
    const nodes = (house.nodes ?? []).slice(1);
    const edited = { ...house, nodes: [...nodes, { ...nodes[0]!, id: 'zz' }].map((n, i) => (i === 0 ? { ...n, hidden: true } : n)) } as Recipe;
    const d = diffRecipe(stock, edited);
    expect(d.added).toBe(1);
    expect(d.removed).toBe(1);
    expect(d.changed).toBeGreaterThanOrEqual(1);
    expect(isUnchanged(diffRecipe(stock, resetTo(edited, stock)))).toBe(true);
    expect(stockOf({ ...house, name: 'custom' } as Recipe)).toBeNull();
  });
});
