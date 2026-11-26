import { describe, expect, it } from 'vitest';
import { NEON_NOCTURNE } from '@/templates/default';
import type { Template } from '@/templates/generated';
import { templateObjects } from './inventory-model';
import { copyStockAsRecipe, objectPositions, recipeOf } from './object-source';

const t = NEON_NOCTURNE as Template;

describe('object-source', () => {
  it('finds the stock recipe of a builtin and builds its positions', () => {
    const building = templateObjects(t).find((o) => o.kind === 'building')!;
    expect(recipeOf(t, building)?.name).toBe('house');
    expect(objectPositions(t, building)!.length).toBeGreaterThan(0);
  });

  it('copies a stock recipe into the template with a fresh name', () => {
    const building = templateObjects(t).find((o) => o.kind === 'building')!;
    const once = copyStockAsRecipe(t, building)!;
    expect(once.kind).toBe('recipe:house');
    expect(once.template.recipes.at(-1)!.nodes.length).toBeGreaterThan(0);
    const twice = copyStockAsRecipe(once.template, building)!;
    expect(twice.kind).toBe('recipe:house_2');
    expect(t.recipes.some((r) => r.name === 'house')).toBe(false);
  });

  it('has nothing to copy for a kind without a stock recipe', () => {
    const cloud = { ...templateObjects(t)[0]!, kind: 'cloud' as const, recipeIndex: null };
    expect(copyStockAsRecipe(t, cloud)).toBeNull();
  });
});
