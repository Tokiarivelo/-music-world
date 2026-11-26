import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { DEMO_ANALYSIS as demo } from './__fixtures__/demo-analysis';
import { buildSpawnPlan } from './spawn-plan';
import { worldSize } from './city';
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
    for (const p of reef.patches) expect(Math.hypot(p.x, p.z) + p.radius).toBeLessThan(worldSize(ABYSS) / 2 + 0.01);
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

  it('follows the layout the director wrote: its patches, and the order of its sequence', () => {
    const realm = featured('enchanted-realm');
    const layout = {
      inventory: [],
      patches: [
        { id: 'grove', theme: 'forest' as const, x: 0.5, z: 0.4, radius: 0.2 },
        { id: 'hill', theme: 'crystal' as const, x: -0.5, z: -0.4, radius: 0.2 },
      ],
      sequence: [
        { kind: 'recipe:magic_tree', patch: 'grove', weight: 3 },
        { kind: 'recipe:crystal_cluster', patch: 'hill', weight: 1 },
      ],
    };
    const directed = { ...realm, layout };
    const reef = reefOf(directed, 5);
    const half = worldSize(realm) / 2;
    expect(reef.patches).toHaveLength(2);
    expect(reef.patches.find((p) => p.theme === 'forest')!.x).toBeGreaterThan(0.3 * half);
    const plan = buildSpawnPlan(demo, directed, 5);
    const first = realm.scenery.reduce((n, i) => n + i.count, 0); // the scenery stands before the first note
    const grounded = plan.records.filter((r) => r.index >= first && (r.kind === 'recipe:magic_tree' || r.kind === 'recipe:crystal_cluster'));
    expect(grounded.length).toBeGreaterThan(0);
    const trees = grounded.filter((r) => r.kind === 'recipe:magic_tree');
    expect(trees.length).toBeGreaterThan(0);
    for (const r of grounded.filter((g) => g.kind === 'recipe:crystal_cluster')) expect(Math.hypot(r.target.x + 0.5 * half, r.target.z + 0.4 * half)).toBeLessThan(0.25 * half);
    for (const r of trees) expect(Math.hypot(r.target.x - 0.5 * half, r.target.z - 0.4 * half)).toBeLessThan(0.25 * half);
    // Without a layout the plan is derived and still valid; with one it differs.
    expect(buildSpawnPlan(demo, realm, 5).records.map((r) => r.target)).not.toEqual(plan.records.map((r) => r.target));
  });

  it('lets the director set the mix of a city, and orders grounded notes whatever their rule gave', () => {
    const directed = { ...DEFAULT_TEMPLATE, layout: { inventory: [], patches: [], sequence: [{ kind: 'tree' as const, patch: null, weight: 1 }, { kind: 'car' as const, patch: null, weight: 1 }] } };
    const kinds = new Set(buildSpawnPlan(demo, directed, 4).records.map((r) => r.kind));
    expect(kinds.has('tree') && kinds.has('car')).toBe(true);
    expect(kinds.has('bush') || kinds.has('conifer') || kinds.has('bicycle')).toBe(false); // the mix replaces the default one
    const realm = featured('enchanted-realm');
    const only = { ...realm, layout: { inventory: [], patches: [{ id: 'a', theme: 'forest' as const, x: 0, z: 0.5, radius: 0.3 }], sequence: [{ kind: 'recipe:magic_tree' as const, patch: 'a', weight: 1 }] } };
    const first = realm.scenery.reduce((n, i) => n + i.count, 0);
    const grounded = buildSpawnPlan(demo, only, 4).records.filter((r) => r.index >= first && r.kind.startsWith('recipe:') && !['recipe:dragon'].includes(r.kind));
    expect(new Set(grounded.map((r) => r.kind))).toEqual(new Set(['recipe:magic_tree']));
  });
});
