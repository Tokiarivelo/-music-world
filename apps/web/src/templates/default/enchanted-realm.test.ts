import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';
import { DEMO_ANALYSIS as demo } from '@/engine/__fixtures__/demo-analysis';
import { buildSpawnPlan } from '@/engine/spawn-plan';
import { reefOf, worldPlanKind } from '@/engine/world-plan';
import { TemplateSchema } from '@/templates/generated';
import { isNaturalModel } from '@/xr/shapes/model-catalog';

const FILE = resolve(__dirname, '../../../../api/music_world/templates/infrastructure/featured/enchanted-realm.json');
const REALM = TemplateSchema.parse(JSON.parse(readFileSync(FILE, 'utf8')));

describe('enchanted-realm store template', () => {
  it('validates, is polished and every object has an authored model', () => {
    expect(REALM.id).toBe('enchanted-realm');
    expect(REALM.fx.material).toBe('polished');
    for (const r of REALM.recipes) expect(isNaturalModel(`recipe:${r.name}`), r.name).toBe(true);
  });

  it('plans a realm: a keep at the middle, then villages, forests and crystal fields', () => {
    expect(worldPlanKind(REALM)).toBe('realm');
    const reef = reefOf(REALM, 5);
    expect(new Set(reef.patches.map((p) => p.theme))).toEqual(new Set(['keep', 'village', 'forest', 'crystal']));
    expect(reef.patches[0]!.theme).toBe('keep');
  });

  it('builds the castle once and keeps dragons rare', () => {
    const plan = buildSpawnPlan(demo, REALM, 5);
    expect(plan.records.filter((r) => r.kind === 'recipe:castle')).toHaveLength(1);
    const dragons = plan.records.filter((r) => r.kind === 'recipe:dragon').length;
    expect(dragons).toBeLessThanOrEqual(2 + Math.ceil(plan.records.length * 0.08));
  });
});
