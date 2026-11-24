import { afterEach, describe, expect, it } from 'vitest';
import { makeTemplate } from '@/engine/__fixtures__/templates';
import { EMPTY_EDITS, addLine, editNote } from '@/engine/edits';
import { buildSpawnPlan } from '@/engine/spawn-plan';
import { InstancedMesh } from 'three';
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
    const noteId = plan.records[index]!.noteId;

    editStore.set({ enabled: true, selection: [noteId] });
    view.update(state);
    expect(view.visibleGlyphs()).toBe(glyphs);
    expect(view.visibleHalos()).toBe(halos + 1);

    editStore.set({ ghost: { noteId, midi: 72 } });
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

describe('StaffView note colors (I9)', () => {
  const glyphMeshes = (view: StaffView) =>
    view.object.children.filter((c): c is InstancedMesh => c instanceof InstancedMesh && c.geometry.getAttribute('position') !== undefined);

  it('keeps the shared material and no instance color when no note has its own color', () => {
    const view = new StaffView(plan);
    view.update(state);
    expect(glyphMeshes(view).every((m) => m.instanceColor === null)).toBe(true);
    view.dispose();
  });

  it('tints a note with its own color and a line color through instance colors', () => {
    const l = addLine(EMPTY_EDITS, 'Harmony', '#00ff88')!;
    const edits = editNote(editNote(l.edits, 'a', { lineId: l.id }), 'b', { color: '#ff0000' });
    const colored = buildSpawnPlan(analysis, makeTemplate({}), 1, edits);
    expect(colored.records.find((r) => r.noteId === 'a')!.colorHex).toBe('#00ff88');
    const view = new StaffView(colored);
    view.update(worldStateAt(colored, 2.5));
    expect(glyphMeshes(view).some((m) => m.instanceColor !== null && m.count > 0)).toBe(true);
    view.dispose();
  });
});
