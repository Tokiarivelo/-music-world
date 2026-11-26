import { describe, expect, it } from 'vitest';
import { NEON_NOCTURNE } from '@/templates/default';
import { STOCK_RECIPES } from '@/xr/shapes/stock-recipes';
import { drawCallEstimate, liveTriangles, BASE_DRAW_CALLS } from './budget-model';
import type { Recipe } from './recipe-model';

describe('budgets', () => {
  it('counts the real triangles of a part tree', () => {
    const house = STOCK_RECIPES.find((r) => r.name === 'house') as unknown as Recipe;
    expect(liveTriangles(house, NEON_NOCTURNE.palette)).toBeGreaterThan(12);
  });
  it('estimates draw calls from the kinds in use', () => {
    expect(drawCallEstimate(NEON_NOCTURNE)).toBeGreaterThan(BASE_DRAW_CALLS);
  });
});
