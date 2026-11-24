import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';
import { DEMO_ANALYSIS as demo } from '@/engine/__fixtures__/demo-analysis';
import { buildSpawnPlan } from '@/engine/spawn-plan';
import { worldStateAt } from '@/engine/world-state';
import { TemplateSchema } from '@/templates/generated';
import { buildRecipeGeometry } from '@/xr/shapes/recipe-builder';

// The ocean launch template is served by the store (featured); the web app validates it like any store template.
const FILE = resolve(__dirname, '../../../../api/music_world/templates/infrastructure/featured/nemo-reef.json');
const NEMO = TemplateSchema.parse(JSON.parse(readFileSync(FILE, 'utf8')));

describe('nemo-reef store template', () => {
  it('validates against music-world.template.v1 (zod)', () => {
    expect(NEMO.id).toBe('nemo-reef');
    expect(NEMO.license).toBe('CC-BY-4.0');
    expect(NEMO.recipes).toHaveLength(16);
  });

  it('builds a geometry for each of its 16 recipes', () => {
    for (const recipe of NEMO.recipes) expect(buildRecipeGeometry(recipe), recipe.name).not.toBeNull();
  });

  it('stands all 21 kinds of ocean objects on the plate before the first note', () => {
    const plan = buildSpawnPlan(demo, NEMO, 1);
    const kinds = new Set(worldStateAt(plan, 0).structures.map((s) => s.kind));
    expect(kinds.size).toBe(21);
    expect(plan.sceneryCount).toBe(NEMO.scenery.reduce((sum, s) => sum + s.count, 0));
  });

  it('arranges the scene differently for another seed, within budget', () => {
    const a = buildSpawnPlan(demo, NEMO, 1);
    const b = buildSpawnPlan(demo, NEMO, 2);
    expect(a.records[0]!.target).not.toEqual(b.records[0]!.target);
    for (const track of a.tracks) {
      expect(Math.min(a.budget, track.recordIndices.length)).toBeLessThanOrEqual(NEMO.budget.instancesPerKind);
    }
  });
});
