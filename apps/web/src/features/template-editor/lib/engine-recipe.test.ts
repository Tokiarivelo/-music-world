import { describe, expect, it } from 'vitest';
import { BUILDING_VARIANTS } from '@/engine/city';
import { buildRecipeGeometry } from '@/xr/shapes/recipe-builder';
import { buildingRecipe, resolveBuildingGeometries } from '@/xr/shapes/building-recipes';
import { buildingVariantGeometries } from '@/xr/shapes/house-shapes';
import { NEON_NOCTURNE } from '@/templates/default';
import type { Template } from '@/templates/generated';
import { MAX_RECIPES } from '../consts/recipe.consts';
import { addBuildingRecipe, buildingRecipeKind } from './engine-recipe';
import { validateTemplate } from './editor-validate';
import { templateObjects } from './inventory-model';

const base = NEON_NOCTURNE as Template;

describe('building recipes', () => {
  it.each(BUILDING_VARIANTS)('builds the %s recipe as a unit-footprint shape of height 1 within its budget', (variant) => {
    const recipe = buildingRecipe(variant);
    expect(recipe.name).toBe(`building_${variant}`);
    const g = buildRecipeGeometry(recipe)!;
    expect(g).not.toBeNull();
    g.computeBoundingBox();
    const box = g.boundingBox!;
    expect(box.min.y).toBeCloseTo(0, 3);
    expect(box.max.y).toBeCloseTo(1, 3);
    expect(Math.max(box.max.x - box.min.x, box.max.z - box.min.z)).toBeLessThanOrEqual(1.3);
    expect(g.getAttribute('position').count / 3).toBeLessThanOrEqual(recipe.budget.maxTriangles);
  });

  it('adds the recipe once, and the template stays valid', () => {
    const first = addBuildingRecipe(base, 'tower')!;
    expect(first.kind).toBe('recipe:building_tower');
    expect(buildingRecipeKind(first.template, 'tower')).toBe(first.kind);
    const again = addBuildingRecipe(first.template, 'tower')!;
    expect(again.template).toBe(first.template);
    expect(validateTemplate(first.template)).toEqual([]);
  });

  it('refuses when the template has no room for another recipe', () => {
    const full = { ...base, recipes: Array.from({ length: MAX_RECIPES }, (_, i) => ({ ...buildingRecipe('tower'), name: `r_${i}` })) } as Template;
    expect(addBuildingRecipe(full, 'house')).toBeNull();
  });

  it('marks the recipe as replacing the built-in variant in the inventory', () => {
    const { template } = addBuildingRecipe(base, 'pagoda')!;
    const obj = templateObjects(template).find((o) => o.kind === 'recipe:building_pagoda')!;
    expect(obj.replaces).toBe('pagoda');
    expect(templateObjects(base).every((o) => o.replaces === null)).toBe(true);
  });

  it('keeps the template valid for every variant', () => {
    for (const variant of BUILDING_VARIANTS) {
      const made = addBuildingRecipe(base, variant)!;
      expect(validateTemplate(made.template)).toEqual([]);
    }
  });

  it('draws the edited recipe in place of the built-in variant, and the built-in shape otherwise', () => {
    const builtin = buildingVariantGeometries()[0]!;
    builtin.computeBoundingBox();
    const stock = resolveBuildingGeometries([]);
    expect(stock).toHaveLength(9);
    const tall = { ...buildingRecipe('tower'), nodes: buildingRecipe('tower').nodes!.slice(0, 1) };
    const out = resolveBuildingGeometries([tall]);
    expect(out[0]!.getAttribute('position').count).toBeLessThan(stock[0]!.getAttribute('position').count);
    expect(out[0]!.hasAttribute('normal')).toBe(true);
    expect(out[1]!.getAttribute('position').count).toBe(stock[1]!.getAttribute('position').count);
  });
});
