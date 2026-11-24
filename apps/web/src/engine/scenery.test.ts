import { describe, expect, it } from 'vitest';
import { DEMO_ANALYSIS as demo } from './__fixtures__/demo-analysis';
import { makeTemplate } from './__fixtures__/templates';
import { zonesFor } from './layout';
import { buildSpawnPlan } from './spawn-plan';
import { worldStateAt } from './world-state';

const OCEAN = makeTemplate({
  mappings: [{ when: {}, spawn: 'building' }],
  zones: [{ kind: 'spike', xMin: -0.5, xMax: 0.5, zMin: -0.5, zMax: 0.5 }],
  scenery: [
    { kind: 'building', count: 4 },
    { kind: 'spike', count: 6 },
    { kind: 'crystal', count: 3 },
  ],
});

describe('template scenery', () => {
  const plan = buildSpawnPlan(demo, OCEAN, 11);

  it('puts the scenery first, ahead of every note, and counts it apart', () => {
    expect(plan.sceneryCount).toBe(13);
    expect(plan.records).toHaveLength(13 + demo.notes.length);
    expect(plan.records.map((r) => r.index)).toEqual(plan.records.map((_, i) => i));
    expect(plan.onsets).toEqual([...plan.onsets].sort((a, b) => a - b));
    expect(plan.records.slice(0, 13).every((r) => r.landAt < 0)).toBe(true);
  });

  it('shows all of it, fully grown, before the first note and before play', () => {
    const state = worldStateAt(plan, 0);
    const standing = state.structures.filter((s) => s.index < plan.sceneryCount);
    expect(standing).toHaveLength(13);
    expect(new Set(standing.map((s) => s.kind))).toEqual(new Set(['building', 'spike', 'crystal']));
    expect(standing.every((s) => s.phase === 'alive' && s.growth === 1 && s.height > 0)).toBe(true);
    expect(state.notesOnStaff.concat([]).every((n) => n.index >= plan.sceneryCount)).toBe(true);
    expect(state.fallingNotes).toHaveLength(0);
    expect(state.spawnedCount).toBe(0);
  });

  it('is not counted as spawned notes later, and keeps its slot apart from the notes', () => {
    const end = worldStateAt(plan, demo.durationSec + 10);
    expect(end.spawnedCount).toBe(demo.notes.length);
    const slots = end.structures.filter((s) => s.kind === 'building').map((s) => s.slot);
    expect(new Set(slots).size).toBe(slots.length);
  });

  it('places scenery inside the zones of its kind, deterministically, and a new seed rearranges it', () => {
    const [zone] = zonesFor('spike', OCEAN);
    for (const r of plan.records.filter((x) => x.index < 13 && x.kind === 'spike')) {
      expect(r.target.x).toBeGreaterThanOrEqual(zone!.xMin);
      expect(r.target.x).toBeLessThanOrEqual(zone!.xMax);
      expect(r.target.z).toBeGreaterThanOrEqual(zone!.zMin);
      expect(r.target.z).toBeLessThanOrEqual(zone!.zMax);
    }
    const again = buildSpawnPlan(demo, OCEAN, 11);
    const other = buildSpawnPlan(demo, OCEAN, 12);
    const spots = (p: typeof plan) => p.records.slice(0, 13).map((r) => r.target);
    expect(spots(again)).toEqual(spots(plan));
    expect(spots(other)).not.toEqual(spots(plan));
  });

  it('adds nothing for a template without scenery', () => {
    const none = buildSpawnPlan(demo, makeTemplate({ mappings: [{ when: {}, spawn: 'building' }] }), 11);
    expect(none.sceneryCount).toBe(0);
    expect(none.records).toHaveLength(demo.notes.length);
  });
});
