import fc from 'fast-check';
import { describe, expect, it } from 'vitest';
import { TemplateSchema, type Template } from '@/templates/generated';
import { NEON_NOCTURNE } from '@/templates/default';
import { MAX_PARTS, MAX_RECIPES, PART_BOUNDS, type PartField } from '../consts/recipe.consts';
import { validateTemplate } from './editor-validate';
import * as r from './recipe-model';

const base = (): Template => structuredClone(NEON_NOCTURNE);
const withTwo = (): Template => r.addRecipe(r.addRecipe(base()));

describe('recipe model', () => {
  it('adds uniquely named recipes up to the limit', () => {
    let t = base();
    for (let i = 0; i < MAX_RECIPES + 3; i += 1) t = r.addRecipe(t);
    expect(t.recipes).toHaveLength(MAX_RECIPES);
    expect(new Set(t.recipes.map((x) => x.name)).size).toBe(t.recipes.length);
    expect(validateTemplate(t).filter((e) => e.path.startsWith('recipes'))).toEqual([]);
  });

  it('a new recipe passes the schema', () => {
    expect(TemplateSchema.safeParse(r.addRecipe(base())).success).toBe(true);
  });

  it('renaming rewrites every reference', () => {
    let t = withTwo();
    const [a] = t.recipes.map((x) => x.name) as [string];
    t = {
      ...t,
      mappings: [{ ...t.mappings[0]!, spawn: `recipe:${a}` }],
      zones: [{ kind: `recipe:${a}`, xMin: -1, xMax: 1, zMin: -1, zMax: 1 }],
      scenery: [{ kind: `recipe:${a}`, count: 2 }],
    };
    const out = r.renameRecipe(t, 0, 'Big Fish-2');
    expect(out.recipes[0]!.name).toBe('big_fish_2');
    expect(out.mappings[0]!.spawn).toBe('recipe:big_fish_2');
    expect(out.zones[0]!.kind).toBe('recipe:big_fish_2');
    expect(out.scenery[0]!.kind).toBe('recipe:big_fish_2');
    expect(validateTemplate(out)).toEqual([]);
  });

  it('a duplicate or empty name is reported, not silently fixed', () => {
    const t = withTwo();
    const dup = r.renameRecipe(t, 0, t.recipes[1]!.name);
    expect(validateTemplate(dup).map((e) => e.code)).toContain('recipeName');
    const empty = r.renameRecipe(t, 0, '');
    expect(validateTemplate(empty).length).toBeGreaterThan(0);
  });

  it('removing falls back to crystal everywhere', () => {
    let t = r.addRecipe(base());
    const name = t.recipes[0]!.name;
    t = { ...t, zones: [{ kind: `recipe:${name}`, xMin: -1, xMax: 1, zMin: -1, zMax: 1 }], scenery: [{ kind: `recipe:${name}`, count: 1 }] };
    const out = r.removeRecipe(t, 0);
    expect(out.recipes).toHaveLength(0);
    expect(out.zones[0]!.kind).toBe('crystal');
    expect(out.scenery[0]!.kind).toBe('crystal');
    expect(validateTemplate(out)).toEqual([]);
  });

  it('keeps 1 to 8 parts', () => {
    let t = r.addRecipe(base());
    for (let i = 0; i < 12; i += 1) t = r.addPart(t, 0);
    expect(t.recipes[0]!.parts).toHaveLength(MAX_PARTS);
    for (let i = 0; i < 12; i += 1) t = r.removePart(t, 0, 0);
    expect(t.recipes[0]!.parts).toHaveLength(1);
  });

  it('counts triangles like shape.py', () => {
    const p = r.newPart();
    expect(r.partTriangles({ ...p, op: 'box' })).toBe(12);
    expect(r.partTriangles({ ...p, op: 'spike' })).toBe(4);
    expect(r.partTriangles({ ...p, op: 'prism', sides: 6, taper: 1 })).toBe(24);
    expect(r.partTriangles({ ...p, op: 'prism', sides: 6, taper: 0 })).toBe(12);
    expect(r.partTriangles({ ...p, op: 'stack', of: 'box', levels: 3 })).toBe(36);
    expect(r.partTriangles({ ...p, op: 'cluster', of: 'prism', sides: 5, taper: 0.5, count: 4 })).toBe(80);
  });

  it('reports a recipe over its budget', () => {
    let t = r.addRecipe(base());
    t = r.setPartOp(t, 0, 0, 'cluster');
    t = r.setPartNumber(t, 0, 0, 'count', 12);
    t = r.setRecipeNumber(t, 0, 'maxTriangles', 12);
    expect(validateTemplate(t).map((e) => e.code)).toContain('recipeBudget');
  });

  it('never mutates its input and always yields a schema-valid shape', () => {
    const fields = Object.keys(PART_BOUNDS) as PartField[];
    fc.assert(
      fc.property(fc.constantFrom(...fields), fc.oneof(fc.double(), fc.integer({ min: -50, max: 200 })), (field, value) => {
        const t = r.addRecipe(base());
        const frozen = JSON.stringify(t);
        const out = r.setPartNumber(t, 0, 0, field, value);
        expect(JSON.stringify(t)).toBe(frozen);
        expect(TemplateSchema.safeParse(out).success).toBe(true);
      }),
    );
  });
});
