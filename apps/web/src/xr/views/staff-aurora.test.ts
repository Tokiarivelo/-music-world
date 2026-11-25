import { afterEach, describe, expect, it } from 'vitest';
import { makeTemplate } from '@/engine/__fixtures__/templates';
import { buildSpawnPlan } from '@/engine/spawn-plan';
import type { EngineAnalysis, NoteEvent } from '@/engine/types';
import { worldStateAt } from '@/engine/world-state';
import { Mesh, InstancedMesh, type Object3D } from 'three';
import { skyStore } from '../sky-store';
import { StaffView } from './staff-view';

const note = (id: string, time: number, midi: number): NoteEvent => ({
  id, time, duration: 0.5, midi, velocity: 0.7, stem: 'other', chordId: null,
});
const analysis: EngineAnalysis = {
  durationSec: 20, tempoBpm: 120, beats: [], chords: [], energy: [],
  notes: [note('a', 3, 48), note('b', 3.5, 84)],
};
const plan = buildSpawnPlan(analysis, makeTemplate({}), 1);
afterEach(() => skyStore.set(false));

function ribbons(view: StaffView): Object3D[] {
  const found: Object3D[] = [];
  view.object.traverse((o) => {
    if (o.name === 'aurora-line') found.push(o);
  });
  return found;
}

describe('StaffView in the northern-lights mode (I30)', () => {
  it('turns the five lines into aurora ribbons and keeps the note glyphs, one color per pitch', () => {
    const state = worldStateAt(plan, 2.8);
    const view = new StaffView(plan);
    view.update(state);
    const classic = view.visibleGlyphs();
    expect(classic).toBeGreaterThan(0);
    expect(ribbons(view).filter((r) => r.visible)).toHaveLength(0);

    skyStore.set(true);
    view.update({ ...state, t: state.t + 0.001 });
    expect(view.visibleGlyphs()).toBe(classic); // the notes are still drawn on the staff
    const visible = ribbons(view).filter((r) => r.visible);
    expect(visible).toHaveLength(5);

    const colors = new Set<string>();
    view.object.traverse((o) => {
      if (o instanceof InstancedMesh && o.count > 0 && o.instanceColor) {
        for (let i = 0; i < o.count; i += 1) colors.add(Array.from(o.instanceColor.array.slice(i * 3, i * 3 + 3)).join());
      }
    });
    expect(colors.size).toBeGreaterThan(1); // low and high notes get different aurora colors
    // The classic tube lines are hidden: the ribbons are the lines now.
    const tubes = view.object.children.filter((c): c is Mesh => c instanceof Mesh && c.name !== 'aurora-line' && !(c instanceof InstancedMesh));
    expect(tubes.every((t) => !t.visible)).toBe(true);
    view.dispose();
  });
});
