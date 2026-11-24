import { afterEach, describe, expect, it } from 'vitest';
import { Matrix4 } from 'three';
import { makeTemplate } from '@/engine/__fixtures__/templates';
import { NOTHING_HIDDEN, type LayerId } from '@/engine/layers';
import { buildSpawnPlan } from '@/engine/spawn-plan';
import type { EngineAnalysis, NoteEvent, Stem } from '@/engine/types';
import { worldStateAt } from '@/engine/world-state';
import { layerStore } from '../layer-store';
import { FxView } from './fx-view';
import { StaffView } from './staff-view';
import { StructureView } from './structure-view';

const note = (id: string, time: number, stem: Stem, chordId: string | null = null): NoteEvent => ({
  id,
  time,
  duration: 0.5,
  midi: 60,
  velocity: 0.6,
  stem,
  chordId,
});
const analysis: EngineAnalysis = {
  durationSec: 30,
  tempoBpm: 120,
  beats: [],
  energy: [],
  chords: [{ id: 'c1', start: 2, end: 8, label: 'C', notes: [] } as never],
  notes: [note('a', 2, 'drums', 'c1'), note('b', 2.1, 'bass', 'c1'), note('c', 2.2, 'vocals'), note('d', 2.3, 'other')],
};
const plan = buildSpawnPlan(analysis, makeTemplate({ staff: { fallDuration: 0.3 } }), 3);
const T_LANDED = 6;
const hide = (...layers: LayerId[]) => layerStore.set(new Set(layers));
afterEach(() => layerStore.set(NOTHING_HIDDEN));

function liveInstances(view: StructureView): number {
  let n = 0;
  for (const kind of plan.tracks.map((t) => t.kind)) {
    const mesh = view.mesh(kind)!;
    for (let i = 0; i < mesh.count; i += 1) {
      const m = new Matrix4();
      mesh.getMatrixAt(i, m);
      if (m.elements[0] !== 0 || m.elements[5] !== 0) n += 1;
    }
  }
  return n;
}

describe('layers in the views (I5)', () => {
  it('hides the structures of a stem, and shows them again, at once even when paused', () => {
    const view = new StructureView(plan);
    const state = worldStateAt(plan, T_LANDED);
    view.update(state);
    const all = liveInstances(view);
    hide('drums');
    view.update(state); // same t: a mask change still redraws
    expect(liveInstances(view)).toBe(all - 1);
    hide('drums', 'bass', 'vocals', 'other');
    view.update(state);
    expect(liveInstances(view)).toBe(all - 4); // scenery (no stem) stays
    layerStore.set(NOTHING_HIDDEN);
    view.update(state);
    expect(liveInstances(view)).toBe(all);
    view.dispose();
  });

  it('hides the notes of a stem on the staff and the lines with the staff layer, with no extra draw call', () => {
    const view = new StaffView(plan);
    const t = 1.5;
    const state = worldStateAt(plan, t);
    view.update(state);
    const shown = view.visibleGlyphs();
    expect(shown).toBeGreaterThan(0);
    hide('drums', 'bass', 'vocals', 'other');
    view.update(state);
    expect(view.visibleGlyphs()).toBe(0);
    layerStore.set(NOTHING_HIDDEN);
    hide('staff');
    view.update(state);
    expect(view.object.children.filter((c) => !c.visible).length).toBeGreaterThan(0);
    expect(view.visibleGlyphs()).toBe(shown);
    view.dispose();
  });

  it('hides chord arcs with the chords layer and particles with fx', () => {
    const view = new FxView(plan);
    const state = worldStateAt(plan, 3);
    view.update(state);
    const arcs = view.visibleArcs();
    hide('chords');
    view.update(state);
    expect(view.visibleArcs()).toBe(0);
    hide('fx');
    view.update(state);
    expect(view.object.children.some((c) => !c.visible)).toBe(true);
    layerStore.set(NOTHING_HIDDEN);
    view.update(state);
    expect(view.visibleArcs()).toBe(arcs);
    view.dispose();
  });

  it('never changes the world state', () => {
    const before = worldStateAt(plan, 3);
    hide('drums', 'vocals');
    expect(worldStateAt(plan, 3)).toEqual(before);
  });
});
