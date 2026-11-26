import { describe, expect, it } from 'vitest';
import { DEMO_ANALYSIS as demo } from './__fixtures__/demo-analysis';
import { makeTemplate } from './__fixtures__/templates';
import { recipeScale } from './recipe-scale';
import { buildSpawnPlan } from './spawn-plan';

const PART = { op: 'box', width: 0.5, depth: 0.5, height: 0.5 };
const WIDE = makeTemplate({
  mappings: [{ when: {}, spawn: 'recipe:squat' }],
  recipes: [
    { name: 'squat', parts: [PART], footprint: 0.9, heightScale: 0.3 },
    { name: 'plain', parts: [PART] },
  ],
});

describe('recipe scale', () => {
  it('reads the footprint and height scale of a recipe, with defaults', () => {
    expect(recipeScale(WIDE, 'recipe:squat')).toEqual({ footprint: 0.9, heightScale: 0.3 });
    expect(recipeScale(WIDE, 'recipe:plain')).toEqual({ footprint: 0.25, heightScale: 1 });
    expect(recipeScale(WIDE, 'recipe:missing')).toEqual({ footprint: 0.25, heightScale: 1 });
    expect(recipeScale(WIDE, 'building')).toEqual({ footprint: 0.25, heightScale: 1 });
  });

  it('shrinks the height of every instance of a squat recipe, notes and scenery alike', () => {
    const build = (recipe: Record<string, unknown>) =>
      makeTemplate({
        mappings: [{ when: {}, spawn: 'recipe:squat' }],
        scenery: [{ kind: 'recipe:squat', count: 2 }],
        recipes: [{ name: 'squat', parts: [PART], ...recipe }],
      });
    const a = buildSpawnPlan(demo, build({}), 3).records;
    const b = buildSpawnPlan(demo, build({ heightScale: 0.3 }), 3).records;
    expect(a).toHaveLength(b.length);
    for (let i = 0; i < a.length; i += 1) expect(b[i]!.height).toBeCloseTo(a[i]!.height * 0.3, 9);
  });
});

describe('variants', () => {
  it('jitters lightness deterministically within the range and keeps plain hex without jitter', async () => {
    const { jitterHex } = await import('./recipe-scale');
    expect(jitterHex('#808080', 0, 1)).toBe('#808080');
    expect(jitterHex('#808080', 0.5, 1)).toBe('#c0c0c0');
    expect(jitterHex('#808080', 0.5, -1)).toBe('#404040');
    expect(jitterHex('#ffffff', 0.5, 1)).toBe('#ffffff');
  });
});
