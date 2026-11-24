import { afterEach, describe, expect, it } from 'vitest';
import { makeTemplate } from '@/engine/__fixtures__/templates';
import { buildSpawnPlan } from '@/engine/spawn-plan';
import type { EngineAnalysis, NoteEvent } from '@/engine/types';
import { worldStateAt } from '@/engine/world-state';
import { EDIT_IDLE, editStore } from '../edit-store';
import { StaffView } from './staff-view';

const note = (id: string, time: number): NoteEvent => ({
  id, time, duration: 0.5, midi: 64, velocity: 0.7, stem: 'other', chordId: null,
});
const analysis: EngineAnalysis = {
  durationSec: 20, tempoBpm: 120, beats: [], chords: [], energy: [], notes: [note('a', 3), note('b', 3.5)],
};
const plan = buildSpawnPlan(analysis, makeTemplate({}), 1);
const state = worldStateAt(plan, 2.5);
afterEach(() => editStore.set(EDIT_IDLE));

describe('StaffView editor marks (I9)', () => {
  it('adds one halo for the selected note and one ghost glyph + halo, and nothing when editing is off', () => {
    const view = new StaffView(plan);
    view.update(state);
    const glyphs = view.visibleGlyphs();
    const halos = view.visibleHalos();
    const index = state.notesOnStaff[0]!.index;

    editStore.set({ enabled: true, selected: index });
    view.update(state);
    expect(view.visibleGlyphs()).toBe(glyphs);
    expect(view.visibleHalos()).toBe(halos + 1);

    editStore.set({ ghost: { index, midi: 72 } });
    view.update(state);
    expect(view.visibleGlyphs()).toBe(glyphs + 1);
    expect(view.visibleHalos()).toBe(halos + 2);

    editStore.set(EDIT_IDLE);
    view.update(state);
    expect(view.visibleGlyphs()).toBe(glyphs);
    expect(view.visibleHalos()).toBe(halos);
    view.dispose();
  });
});
