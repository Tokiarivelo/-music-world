import { describe, expect, it } from 'vitest';
import { makeTemplate } from '@/engine/__fixtures__/templates';
import { buildSpawnPlan } from '@/engine/spawn-plan';
import type { EngineAnalysis, NoteEvent } from '@/engine/types';
import { worldStateAt } from '@/engine/world-state';
import { auroraDescentPosition, rainbowHex, skyPosition } from '@/engine/sky';
import { InstancedMesh } from 'three';
import { skyStore } from '../sky-store';
import { StaffView } from './staff-view';

const note = (id: string, time: number, midi: number): NoteEvent => ({
  id,
  time,
  duration: 0.5,
  midi,
  velocity: 0.7,
  stem: 'other',
  chordId: null,
});

const analysis: EngineAnalysis = {
  durationSec: 20,
  tempoBpm: 120,
  beats: [],
  chords: [],
  energy: [],
  notes: [
    note('n1', 2, 48),
    note('n2', 4, 60),
    note('n3', 6, 72),
    note('n4', 8, 84),
  ],
};

const template = makeTemplate({ staff: { style: 'aurora', lookahead: 5, fallDuration: 1.5 } });
const plan = buildSpawnPlan(analysis, template, 42);

describe('Aurora Mountain Horizon and Rainbow Descent', () => {
  it('positions notes in a circular ring around the mountain horizon', () => {
    const size = plan.template.terrain.size;
    for (const r of plan.records) {
      const { position } = skyPosition(plan, r, 0);
      const radius = Math.hypot(position.x, position.z);
      // Located at the mountain ridges surrounding the plate (> 1.5 * terrain size)
      expect(radius).toBeGreaterThan(size * 1.5);
      expect(radius).toBeLessThan(size * 2.8);
      // Height sits gracefully above the mountains
      expect(position.y).toBeGreaterThanOrEqual(plan.staff.baseY);
      expect(position.y).toBeLessThan(size * 0.7);
    }
  });

  it('computes smooth descent from mountain horizon to target on the ground', () => {
    const r = plan.records[0]!;
    const horizon = skyPosition(plan, r, r.onset).position;
    const size = plan.template.terrain.size;

    const start = auroraDescentPosition(horizon, r.target, 12345, 0, size);
    expect(start.x).toBeCloseTo(horizon.x, 3);
    expect(start.y).toBeCloseTo(horizon.y, 3);
    expect(start.z).toBeCloseTo(horizon.z, 3);

    const end = auroraDescentPosition(horizon, r.target, 12345, 1, size);
    expect(end.x).toBeCloseTo(r.target.x, 3);
    expect(end.y).toBeCloseTo(r.target.y, 3);
    expect(end.z).toBeCloseTo(r.target.z, 3);

    // Mid-flight is between horizon and target
    const mid = auroraDescentPosition(horizon, r.target, 12345, 0.5, size);
    expect(mid.y).toBeLessThan(horizon.y);
    expect(mid.y).toBeGreaterThan(r.target.y);
  });

  it('generates multi-color rainbow hex codes across flight progress', () => {
    const colors = new Set<string>();
    for (let i = 0; i <= 10; i += 1) {
      const hex = rainbowHex(i / 10, 5.0, 60);
      expect(hex).toMatch(/^#[0-9a-f]{6}$/i);
      colors.add(hex);
    }
    // Must cycle through multiple distinct colors of the rainbow
    expect(colors.size).toBeGreaterThan(6);
  });

  it('renders descending notes with rainbow colors in northern lights mode', () => {
    skyStore.set(true);
    const view = new StaffView(plan);

    // At t = 2.5, note n1 (onset 2.0, fallDuration 1.5) is descending!
    const state = worldStateAt(plan, 2.5);
    view.update(state);

    const colors: string[] = [];
    view.object.traverse((o) => {
      if (o instanceof InstancedMesh && o.count > 0 && o.instanceColor) {
        for (let i = 0; i < o.count; i += 1) {
          const r = o.instanceColor.array[i * 3];
          const g = o.instanceColor.array[i * 3 + 1];
          const b = o.instanceColor.array[i * 3 + 2];
          colors.push(`${r?.toFixed(2)},${g?.toFixed(2)},${b?.toFixed(2)}`);
        }
      }
    });

    expect(colors.length).toBeGreaterThan(0);
    view.dispose();
    skyStore.set(false);
  });
});
