import { describe, expect, it } from 'vitest';
import { BUILDING_VARIANTS } from '@/engine/city';
import { buildRecipeGeometry } from '@/xr/shapes/recipe-builder';
import { buildingRecipe, resolveBuildingGeometries } from '@/xr/shapes/building-recipes';
import { buildingVariantGeometries } from '@/xr/shapes/house-shapes';
import { NEON_NOCTURNE } from '@/templates/default';
import type { Template } from '@/templates/generated';
import { MAX_RECIPES } from '../consts/recipe.consts';
import { addEngineRecipe, engineRecipeKind } from './engine-recipe';
import { ENGINE_RECIPE_NAMES, engineRecipe, resolveCraneGeometry, resolvePoleGeometry, resolveScaffoldGeometry, SIGNAL_POLE_HEIGHT } from '@/xr/shapes/site-recipes';
import { craneGeometry, scaffoldGeometry } from '@/xr/shapes/house-shapes';
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
    const first = addEngineRecipe(base, 'building_tower')!;
    expect(first.kind).toBe('recipe:building_tower');
    expect(engineRecipeKind(first.template, 'building_tower')).toBe(first.kind);
    const again = addEngineRecipe(first.template, 'building_tower')!;
    expect(again.template).toBe(first.template);
    expect(validateTemplate(first.template)).toEqual([]);
  });

  it('refuses when the template has no room for another recipe', () => {
    const full = { ...base, recipes: Array.from({ length: MAX_RECIPES }, (_, i) => ({ ...buildingRecipe('tower'), name: `r_${i}` })) } as Template;
    expect(addEngineRecipe(full, 'building_house')).toBeNull();
  });

  it('marks the recipe as replacing the built-in variant in the inventory', () => {
    const { template } = addEngineRecipe(base, 'building_pagoda')!;
    const obj = templateObjects(template).find((o) => o.kind === 'recipe:building_pagoda')!;
    expect(obj.replaces).toBe('building.pagoda');
    expect(templateObjects(base).every((o) => o.replaces === null)).toBe(true);
  });

  it('keeps the template valid for every variant', () => {
    for (const variant of BUILDING_VARIANTS) {
      const made = addEngineRecipe(base, `building_${variant}`)!;
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

  it.each(['site_scaffold', 'site_crane', 'signal_pole'])('builds the %s recipe within its budget and keeps the template valid', (name) => {
    const recipe = engineRecipe(name)!;
    expect(recipe.nodes!.length).toBeLessThanOrEqual(48);
    const g = buildRecipeGeometry(recipe)!;
    expect(g).not.toBeNull();
    expect(g.getAttribute('position').count / 3).toBeLessThanOrEqual(recipe.budget.maxTriangles);
    expect(validateTemplate(addEngineRecipe(base, name)!.template)).toEqual([]);
  });

  it('lists every engine recipe name once and refuses an unknown one', () => {
    expect(new Set(ENGINE_RECIPE_NAMES).size).toBe(ENGINE_RECIPE_NAMES.length);
    expect(ENGINE_RECIPE_NAMES.every((n) => engineRecipe(n) !== null)).toBe(true);
    expect(addEngineRecipe(base, 'nope')).toBeNull();
  });

  it('draws a template recipe in place of the scaffold, the crane and the pole', () => {
    const scaf = { ...engineRecipe('site_scaffold')!, nodes: engineRecipe('site_scaffold')!.nodes!.slice(0, 4) };
    expect(resolveScaffoldGeometry([scaf], scaffoldGeometry()).getAttribute('position').count).toBeLessThan(scaffoldGeometry().getAttribute('position').count);
    const crane = engineRecipe('site_crane')!;
    expect(resolveCraneGeometry([crane], craneGeometry()).getAttribute('normal')).toBeDefined();
    const pole = resolvePoleGeometry([engineRecipe('signal_pole')!], scaffoldGeometry());
    pole.computeBoundingBox();
    expect(pole.boundingBox!.max.y).toBeCloseTo(SIGNAL_POLE_HEIGHT, 3);
    expect(resolvePoleGeometry([], scaffoldGeometry())).toBeDefined();
  });

  it('gives every building variant the same attributes when one part is painted (shared material)', () => {
    const tower = buildingRecipe('tower');
    const painted = { ...tower, nodes: tower.nodes!.map((n, i) => (i === 0 ? { ...n, material: { ...n.material, color: '#ff0000' } } : n)) };
    const out = resolveBuildingGeometries([painted]);
    expect(out.every((g) => g.hasAttribute('color'))).toBe(true);
    expect(out.every((g) => !g.hasAttribute('aTex'))).toBe(true);
    const textured = { ...tower, nodes: tower.nodes!.map((n, i) => (i === 0 ? { ...n, material: { ...n.material, texture: 'brick' as const } } : n)) };
    expect(resolveBuildingGeometries([textured]).every((g) => g.hasAttribute('aTex'))).toBe(true);
  });
});
