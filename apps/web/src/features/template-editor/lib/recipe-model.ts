import type { Template } from '@/templates/generated';
import {
  MAX_PARTS,
  MAX_RECIPES,
  PART_BOUNDS,
  RECIPE_BOUNDS,
  RECIPE_FALLBACK_KIND,
  RECIPE_NAME,
  type PartField,
  type RecipeField,
} from '../consts/recipe.consts';

/** Pure, immutable updates of `template.recipes` (no React, no I/O). Mirrors `apps/api/music_world/schemas/shape.py`. */

export type Recipe = Template['recipes'][number];
export type Part = Recipe['parts'][number];

const SIDES_OF_TRIANGLES = 4; // a spike is an open 4-sided cone

function clamp(value: number, min: number, max: number, integer: boolean): number {
  if (!Number.isFinite(value)) return min;
  const v = Math.min(max, Math.max(min, value));
  return integer ? Math.round(v) : v;
}

export function clampPart(field: PartField, value: number): number {
  const { min, max, integer } = PART_BOUNDS[field];
  return clamp(value, min, max, integer);
}

export function clampRecipe(field: RecipeField, value: number): number {
  const { min, max, integer } = RECIPE_BOUNDS[field];
  return clamp(value, min, max, integer);
}

function primitiveTriangles(of: Part['of'], sides: number, taper: number): number {
  if (of === 'box') return 12;
  if (of === 'spike') return SIDES_OF_TRIANGLES;
  return taper > 0 ? 4 * sides : 2 * sides;
}

export function partTriangles(part: Part): number {
  if (part.op === 'box' || part.op === 'prism' || part.op === 'spike') {
    return primitiveTriangles(part.op, part.sides, part.taper);
  }
  const per = primitiveTriangles(part.of, part.sides, part.op === 'stack' ? 1 : part.taper);
  return (part.op === 'stack' ? part.levels : part.count) * per;
}

export function recipeTriangles(recipe: Recipe): number {
  return recipe.parts.reduce((sum, p) => sum + partTriangles(p), 0);
}

export function newPart(): Part {
  return {
    op: 'box',
    of: 'box',
    width: 0.5,
    depth: 0.5,
    height: 0.5,
    y: 0,
    sides: 6,
    taper: 1,
    levels: 3,
    shrink: 0.8,
    count: 4,
    spread: 0.6,
    seedOffset: 0,
  };
}

/** A name not used by `taken`: `shape`, `shape_2`, `shape_3`… */
export function freshRecipeName(taken: readonly string[], base = 'shape'): string {
  if (!taken.includes(base)) return base;
  for (let n = 2; ; n += 1) {
    const name = `${base}_${n}`.slice(0, RECIPE_NAME.max);
    if (!taken.includes(name)) return name;
  }
}

export function newRecipe(taken: readonly string[]): Recipe {
  return {
    schema: 'music-world.shape.v1',
    name: freshRecipeName(taken),
    parts: [newPart()],
    nodes: [],
    budget: { maxTriangles: 500 },
    footprint: 0.25,
    heightScale: 1,
  };
}

/** Lower-case, `a-z0-9_` only, ≤ 40 characters: what the user typed made valid. Empty when nothing is left. */
export function sanitizeRecipeName(raw: string): string {
  return raw
    .toLowerCase()
    .replace(/[\s-]+/g, '_')
    .replace(/[^a-z0-9_]/g, '')
    .slice(0, RECIPE_NAME.max);
}

function rewriteKind(kind: string, from: string, to: string): string {
  return kind === `recipe:${from}` ? to : kind;
}

/** Every `recipe:<from>` reference of mappings, zones and scenery becomes `to`. */
function rewriteReferences(template: Template, from: string, to: string): Template {
  return {
    ...template,
    mappings: template.mappings.map((m) => ({ ...m, spawn: rewriteKind(m.spawn, from, to) })),
    zones: template.zones.map((z) => ({ ...z, kind: rewriteKind(z.kind, from, to) })),
    scenery: template.scenery.map((s) => ({ ...s, kind: rewriteKind(s.kind, from, to) })),
  };
}

export function addRecipe(template: Template, recipe?: Recipe): Template {
  if (template.recipes.length >= MAX_RECIPES) return template;
  const next = recipe ?? newRecipe(template.recipes.map((r) => r.name));
  return { ...template, recipes: [...template.recipes, next] };
}

/** Removes the recipe; whatever used it falls back to `crystal` so the draft stays valid. */
export function removeRecipe(template: Template, index: number): Template {
  const recipe = template.recipes[index];
  if (!recipe) return template;
  const without = { ...template, recipes: template.recipes.filter((_, i) => i !== index) };
  return rewriteReferences(without, recipe.name, RECIPE_FALLBACK_KIND);
}

/** Renames and rewrites the references. An empty or already used name is kept as typed so validation reports it. */
export function renameRecipe(template: Template, index: number, raw: string): Template {
  const recipe = template.recipes[index];
  if (!recipe) return template;
  const name = sanitizeRecipeName(raw);
  if (name === recipe.name) return template;
  const renamed = {
    ...template,
    recipes: template.recipes.map((r, i) => (i === index ? { ...r, name } : r)),
  };
  const taken = template.recipes.some((r, i) => i !== index && r.name === name);
  return name === '' || taken ? renamed : rewriteReferences(renamed, recipe.name, `recipe:${name}`);
}

export function updateRecipe(template: Template, index: number, change: (recipe: Recipe) => Recipe): Template {
  const recipe = template.recipes[index];
  if (!recipe) return template;
  return { ...template, recipes: template.recipes.map((r, i) => (i === index ? change(recipe) : r)) };
}

export function setRecipeNumber(template: Template, index: number, field: RecipeField, value: number): Template {
  const v = clampRecipe(field, value);
  return updateRecipe(template, index, (r) =>
    field === 'maxTriangles' ? { ...r, budget: { ...r.budget, maxTriangles: v } } : { ...r, [field]: v },
  );
}

export function addPart(template: Template, index: number, part: Part = newPart()): Template {
  return updateRecipe(template, index, (r) => (r.parts.length >= MAX_PARTS ? r : { ...r, parts: [...r.parts, part] }));
}

export function removePart(template: Template, index: number, partIndex: number): Template {
  return updateRecipe(template, index, (r) =>
    r.parts.length <= 1 || partIndex < 0 || partIndex >= r.parts.length
      ? r
      : { ...r, parts: r.parts.filter((_, i) => i !== partIndex) },
  );
}

function updatePart(template: Template, index: number, partIndex: number, change: (part: Part) => Part): Template {
  return updateRecipe(template, index, (r) =>
    r.parts[partIndex] ? { ...r, parts: r.parts.map((p, i) => (i === partIndex ? change(p) : p)) } : r,
  );
}

export function setPartNumber(template: Template, index: number, partIndex: number, field: PartField, value: number): Template {
  return updatePart(template, index, partIndex, (p) => ({ ...p, [field]: clampPart(field, value) }));
}

export function setPartOp(template: Template, index: number, partIndex: number, op: Part['op']): Template {
  return updatePart(template, index, partIndex, (p) => ({ ...p, op }));
}

export function setPartPrimitive(template: Template, index: number, partIndex: number, of: Part['of']): Template {
  return updatePart(template, index, partIndex, (p) => ({ ...p, of }));
}
