import { afterEach, describe, expect, it } from 'vitest';
import { makeTemplate } from '@/engine/__fixtures__/templates';
import { EMPTY_EDITS, addLine, editNote } from '@/engine/edits';
import { buildSpawnPlan } from '@/engine/spawn-plan';
import { Box3, InstancedMesh } from 'three';
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

describe('voice line staves and colorRole "line" (I9)', () => {
  it('draws one more staff mesh per voice line, lifted by its offset, and none for the main line', () => {
    const base = new StaffView(plan);
    const l = addLine(EMPTY_EDITS, 'Harmony', '#00ff88')!;
    const withLine = buildSpawnPlan(analysis, makeTemplate({}), 1, l.edits);
    const view = new StaffView(withLine);
    expect(view.object.children.length).toBe(base.object.children.length + 1);
    const lifted = view.object.children.find((c) => (c as { material?: { color?: { r: number; g: number } } }).material?.color?.r === 0 && ((c as { material?: { color?: { g: number } } }).material?.color?.g ?? 0) > 0.5);
    expect(lifted).toBeDefined();
    const box = new Box3().setFromObject(lifted!);
    expect(box.max.y).toBeGreaterThan(withLine.staff.baseY + withLine.staff.lineGap * 4 + withLine.staff.lineGap * 4);
    base.dispose();
    view.dispose();
  });

  it('a rule with colorRole "line" gives the structure the line color; without a color it falls back to the gradient', () => {
    const t = makeTemplate({
      mappings: [{ when: {}, spawn: 'building', colorRole: 'line' }],
    });
    const l = addLine(EMPTY_EDITS, 'Harmony', '#00ff88')!;
    const edits = editNote(l.edits, 'a', { lineId: l.id });
    const p = buildSpawnPlan(analysis, t, 1, edits);
    const notes = p.records.slice(p.sceneryCount);
    expect(notes.find((r) => r.noteId === 'a')).toMatchObject({ structureHex: '#00ff88', colorRole: null });
    expect(notes.find((r) => r.noteId === 'b')).toMatchObject({ structureHex: null, colorRole: null });
    const s = worldStateAt(p, 10).structures.find((x) => p.records[x.index]!.noteId === 'a');
    expect(s?.structureHex).toBe('#00ff88');
  });
});
