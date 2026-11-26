import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { DEMO_ANALYSIS as demo } from './__fixtures__/demo-analysis';
import { buildSpawnPlan } from './spawn-plan';
import { inventoryOf, reefOf, roleOf, worldPlanKind } from './world-plan';
import { TemplateSchema } from '@/templates/generated';
import { DEFAULT_TEMPLATE } from '@/templates/default';

const featured = (name: string) =>
  TemplateSchema.parse(JSON.parse(readFileSync(resolve(__dirname, `../../../api/music_world/templates/infrastructure/featured/${name}.json`), 'utf8')));
const ABYSS = featured('abyssal-currents');
const SEABED = ['kelp', 'seagrass', 'staghorn_coral', 'brain_coral', 'coral_fan', 'tube_sponge', 'sea_anemone', 'starfish', 'sea_urchin', 'crab', 'seashell', 'shipwreck'];

describe('world plans', () => {
  it('lists the inventory of a template with a role for each kind', () => {
    const inv = inventoryOf(ABYSS);
    expect(inv.length).toBeGreaterThan(20);
    expect(inv.find((i) => i.kind === 'recipe:kelp')?.role).toBe('benthic');
    expect(inv.find((i) => i.kind === 'recipe:whale')?.role).toBe('giant');
    expect(roleOf('car')).toBe('vehicle');
    expect(inventoryOf(DEFAULT_TEMPLATE).map((i) => i.kind)).toContain('building');
  });

  it('chooses the plan from the template', () => {
    expect(worldPlanKind(DEFAULT_TEMPLATE)).toBe('city');
    expect(worldPlanKind(ABYSS)).toBe('reef');
  });

  it('lays a reef: patches of every theme inside the plate, deterministic', () => {
    const reef = reefOf(ABYSS, 3);
    expect(new Set(reef.patches.map((p) => p.theme))).toEqual(new Set(['kelp', 'coral', 'sand', 'wreck']));
    for (const p of reef.patches) expect(Math.hypot(p.x, p.z) + p.radius).toBeLessThan(ABYSS.terrain.size / 2 + 0.01);
    expect(reefOf(ABYSS, 3)).toEqual(reef);
  });

  it('grows seabed life in the patches, and keeps the swimmers and giants of the rules', () => {
    const plan = buildSpawnPlan(demo, ABYSS, 3);
    const reef = reefOf(ABYSS, 3);
    const seabed = plan.records.filter((r) => SEABED.some((n) => r.kind === `recipe:${n}`));
    expect(seabed.length).toBeGreaterThan(30);
    for (const r of seabed) {
      expect(reef.patches.some((p) => Math.hypot(r.target.x - p.x, r.target.z - p.z) <= p.radius + 0.01), r.kind).toBe(true);
    }
    expect(plan.records.some((r) => ['recipe:whale', 'recipe:dolphin', 'recipe:clownfish'].includes(r.kind))).toBe(true);
  });
});
