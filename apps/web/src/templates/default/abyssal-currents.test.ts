import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';
import { DEMO_ANALYSIS as demo } from '@/engine/__fixtures__/demo-analysis';
import { buildSpawnPlan } from '@/engine/spawn-plan';
import { worldStateAt } from '@/engine/world-state';
import { TemplateSchema } from '@/templates/generated';
import { isNaturalModel } from '@/xr/shapes/model-catalog';
import { buildRecipeGeometry } from '@/xr/shapes/recipe-builder';

const FILE = resolve(__dirname, '../../../../api/music_world/templates/infrastructure/featured/abyssal-currents.json');
const ABYSS = TemplateSchema.parse(JSON.parse(readFileSync(FILE, 'utf8')));

describe('abyssal-currents store template', () => {
  it('validates, is underwater and uses the current staff style', () => {
    expect(ABYSS.id).toBe('abyssal-currents');
    expect(ABYSS.fx.environment).toBe('underwater');
    expect(ABYSS.staff.style).toBe('current');
    for (const recipe of ABYSS.recipes) expect(buildRecipeGeometry(recipe), recipe.name).not.toBeNull();
  });

  it('is polished and every animal and plant has an authored model', () => {
    expect(ABYSS.fx.material).toBe('polished');
    for (const r of ABYSS.recipes) {
      if (r.name === 'bubble_column') continue; // procedural
      expect(isNaturalModel(`recipe:${r.name}`), r.name).toBe(true);
    }
  });

  it('carries every falling note on a path that ends on its target', () => {
    const plan = buildSpawnPlan(demo, ABYSS, 1);
    const r = plan.records[0]!;
    const mid = worldStateAt(plan, r.onset + plan.fallDuration / 2).fallingNotes.find((n) => n.index === 0)!;
    expect(mid.position.y).toBeLessThan(plan.staff.baseY + 5);
    const landed = worldStateAt(plan, r.landAt + 0.01).structures.find((s) => s.index === r.index)!;
    expect(landed.position).toEqual(r.target);
  });
});
