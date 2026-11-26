import { describe, expect, it } from 'vitest';
import { DEMO_ANALYSIS as demo } from './__fixtures__/demo-analysis';
import { makeTemplate } from './__fixtures__/templates';
import { buildSpawnPlan } from './spawn-plan';
import { worldStateAt } from './world-state';

const PLACED = [
  { id: 'o1', kind: 'tree' as const, x: 2.5, y: 0, z: -1.5, yaw: 90, scale: 2, variant: 3, color: null },
  { id: 'o2', kind: 'spike' as const, x: -3, y: 0, z: 4, yaw: 0, scale: 1, variant: 0, color: '#112233' },
];
const withPlaced = (seed: number | null = null) =>
  makeTemplate({
    mappings: [{ when: {}, spawn: 'crystal' }],
    scenery: [{ kind: 'bush', count: 2 }],
    layout: { inventory: [], patches: [], sequence: [], placed: PLACED, seed },
  });

describe('placed objects (map creator)', () => {
  const plan = buildSpawnPlan(demo, withPlaced(), 11);

  it('stand after the scenery and before every note, counted as scenery', () => {
    expect(plan.sceneryCount).toBe(2 + PLACED.length);
    expect(plan.records).toHaveLength(plan.sceneryCount + demo.notes.length);
    expect(plan.records.map((r) => r.index)).toEqual(plan.records.map((_, i) => i));
    expect(plan.onsets).toEqual([...plan.onsets].sort((a, b) => a - b));
  });

  it('keep the position, yaw, variant, scale and colour the creator chose', () => {
    const tree = plan.records.find((r) => r.noteId === 'scenery:placed:o1')!;
    expect(tree.target).toEqual({ x: 2.5, y: 0, z: -1.5 });
    expect(tree.yaw).toBeCloseTo(Math.PI / 2, 6);
    expect(tree.variant).toBe(3);
    const small = plan.records.find((r) => r.noteId === 'scenery:placed:o2')!;
    expect(small.colorHex).toBe('#112233');
  });

  it('are standing and fully grown at t = 0, and notes still spawn their own objects', () => {
    const start = worldStateAt(plan, 0);
    const placed = start.structures.filter((s) => plan.records[s.index]!.noteId.startsWith('scenery:placed:'));
    expect(placed).toHaveLength(PLACED.length);
    expect(placed.every((s) => s.phase === 'alive' && s.growth === 1)).toBe(true);
    expect(start.spawnedCount).toBe(0);
    const end = worldStateAt(plan, demo.durationSec + 10);
    expect(end.spawnedCount).toBe(demo.notes.length);
    expect(end.structures.filter((s) => s.kind === 'crystal').length).toBeGreaterThan(0);
  });

  it('are deterministic and ignore the project seed when the map has its own', () => {
    expect(buildSpawnPlan(demo, withPlaced(), 11)).toEqual(plan);
    const fixed = (project: number) => buildSpawnPlan(demo, withPlaced(5), project).records.map((r) => r.target);
    expect(fixed(1)).toEqual(fixed(999));
    expect(buildSpawnPlan(demo, withPlaced(), 1).records.map((r) => r.target)).not.toEqual(buildSpawnPlan(demo, withPlaced(), 2).records.map((r) => r.target));
  });

  it('change nothing for a template without placed objects', () => {
    const none = makeTemplate({ mappings: [{ when: {}, spawn: 'crystal' }], scenery: [{ kind: 'bush', count: 2 }] });
    expect(buildSpawnPlan(demo, none, 11).sceneryCount).toBe(2);
  });
});
