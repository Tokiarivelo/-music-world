import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import fc from 'fast-check';
import { buildRecipeGeometry, type ShapeRecipe } from './recipe-builder';
import { triangleCount } from './builtin-shapes';
import { SHAPE_TRIANGLE_BUDGET } from '../constants';

interface Case {
  name: string;
  triangles: number;
  recipe: ShapeRecipe;
}

// Shared with the API tests: both sides must agree on the size of every recipe.
const FIXTURES = JSON.parse(
  readFileSync(join(process.cwd(), '../api/tests/fixtures/shape-recipes.json'), 'utf8'),
) as Case[];

describe('recipe builder', () => {
  it.each(FIXTURES.map((c) => [c.name, c] as const))('%s: triangle count matches the Python mirror', (_, c) => {
    const g = buildRecipeGeometry(c.recipe)!;
    expect(triangleCount(g)).toBe(c.triangles);
  });

  it.each(FIXTURES.map((c) => [c.name, c] as const))('%s: unit footprint, base at 0, height 1, budget', (_, c) => {
    const g = buildRecipeGeometry(c.recipe)!;
    g.computeBoundingBox();
    const { min, max } = g.boundingBox!;
    expect(min.y).toBeCloseTo(0, 6);
    expect(max.y).toBeCloseTo(1, 6);
    for (const v of [min.x, min.z, max.x, max.z]) expect(Math.abs(v)).toBeLessThanOrEqual(0.5 + 1e-6);
    expect(triangleCount(g)).toBeLessThanOrEqual(SHAPE_TRIANGLE_BUDGET);
    expect(g.hasAttribute('normal') || g.hasAttribute('uv')).toBe(false);
  });

  it('is deterministic and the seed offset changes a cluster', () => {
    const cluster = FIXTURES.find((c) => c.name === 'crystal_cluster')!.recipe;
    const a = buildRecipeGeometry(cluster)!.getAttribute('position').array;
    const b = buildRecipeGeometry(structuredClone(cluster))!.getAttribute('position').array;
    expect(Array.from(a)).toEqual(Array.from(b));
    const other = structuredClone(cluster);
    other.parts[0]!.seedOffset = 4;
    expect(Array.from(buildRecipeGeometry(other)!.getAttribute('position').array)).not.toEqual(Array.from(a));
  });

  it('returns null for a recipe over its own budget', () => {
    const tight = structuredClone(FIXTURES[0]!.recipe);
    tight.budget = { maxTriangles: 11 };
    expect(buildRecipeGeometry(tight)).toBeNull();
  });

  it('any bounded recipe within budget builds finite geometry of height 1', () => {
    const part = fc.record({
      op: fc.constantFrom('box', 'prism', 'spike', 'stack', 'cluster' as const),
      of: fc.constantFrom('box', 'prism', 'spike' as const),
      width: fc.double({ min: 0.05, max: 1, noNaN: true }),
      depth: fc.double({ min: 0.05, max: 1, noNaN: true }),
      height: fc.double({ min: 0.05, max: 1, noNaN: true }),
      y: fc.double({ min: 0, max: 1, noNaN: true }),
      sides: fc.integer({ min: 3, max: 12 }),
      taper: fc.double({ min: 0, max: 1, noNaN: true }),
      levels: fc.integer({ min: 2, max: 8 }),
      shrink: fc.double({ min: 0.5, max: 1, noNaN: true }),
      count: fc.integer({ min: 2, max: 12 }),
      spread: fc.double({ min: 0, max: 1, noNaN: true }),
      seedOffset: fc.integer({ min: 0, max: 99 }),
    });
    fc.assert(
      fc.property(fc.array(part, { minLength: 1, maxLength: 3 }), (parts) => {
        const g = buildRecipeGeometry({ name: 'x', parts, budget: { maxTriangles: 600 } } as unknown as ShapeRecipe);
        if (!g) return true; // over budget: rejected, never built
        g.computeBoundingBox();
        const { min, max } = g.boundingBox!;
        return (
          Array.from(g.getAttribute('position').array).every(Number.isFinite) &&
          Math.abs(min.y) < 1e-6 &&
          Math.abs(max.y - 1) < 1e-6
        );
      }),
      { numRuns: 60 },
    );
  });
});
