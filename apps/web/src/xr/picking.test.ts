import { describe, expect, it } from 'vitest';
import { makeTemplate } from '@/engine/__fixtures__/templates';
import { buildSpawnPlan } from '@/engine/spawn-plan';
import type { EngineAnalysis, NoteEvent } from '@/engine/types';
import { worldStateAt } from '@/engine/world-state';
import { pickAtRay, pickAtScreen, pickables, type Pickable } from './picking';

const note = (id: string, time: number, stem: NoteEvent['stem']): NoteEvent => ({
  id, time, duration: 0.5, midi: 64, velocity: 0.7, stem, chordId: null,
});
const analysis: EngineAnalysis = {
  durationSec: 20, tempoBpm: 120, beats: [], chords: [], energy: [],
  notes: [note('a', 3, 'drums'), note('b', 4, 'vocals')],
};
const plan = buildSpawnPlan(analysis, makeTemplate({}), 1);
const state = worldStateAt(plan, 2.5);

const items: Pickable[] = [
  { index: 0, position: { x: 0, y: 0, z: 0 } },
  { index: 1, position: { x: 0.01, y: 0, z: 0 } },
  { index: 2, position: { x: 5, y: 0, z: 0 } },
];
const project = (p: { x: number; y: number }) => ({ x: p.x * 100, y: p.y * 100 });

describe('picking (I9)', () => {
  it('lists the notes of the frame and drops hidden layers', () => {
    expect(pickables(state, plan, new Set()).length).toBe(state.notesOnStaff.length + state.fallingNotes.length);
    expect(pickables(state, plan, new Set())).not.toHaveLength(0);
    expect(pickables(state, plan, new Set(['drums', 'vocals']))).toHaveLength(0);
  });

  it('screen pick: nearest within the radius, else null', () => {
    expect(pickAtScreen(items, project, { x: 1, y: 0 })).toBe(1);
    expect(pickAtScreen(items, project, { x: -3, y: 0 })).toBe(0);
    expect(pickAtScreen(items, project, { x: 100, y: 100 })).toBeNull();
    expect(pickAtScreen(items, project, { x: 500, y: 0 }, 24)).toBe(2);
    expect(pickAtScreen(items, () => null, { x: 0, y: 0 })).toBeNull();
  });

  it('screen pick: the radius is at least 24 px by default', () => {
    expect(pickAtScreen(items, project, { x: 20, y: 0 })).toBe(1);
    expect(pickAtScreen(items, project, { x: 26, y: 0 })).toBeNull();
  });

  it('ray pick: nearest to the ray, ignores notes behind and out of the cone', () => {
    const origin = { x: 0, y: 0, z: 5 };
    const down = { x: 0, y: 0, z: -1 };
    expect(pickAtRay(items, origin, down)).toBe(0);
    expect(pickAtRay(items, origin, { x: 0, y: 0, z: 1 })).toBeNull();
    expect(pickAtRay(items, origin, { x: 0, y: 1, z: 0 })).toBeNull();
  });
});
