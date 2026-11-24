import { describe, expect, it } from 'vitest';
import { makeTemplate } from './__fixtures__/templates';
import { EMPTY_EDITS, addLine, addNote, editNote } from './edits';
import { buildSpawnPlan } from './spawn-plan';
import { staffNotePosition } from './staff';
import type { EngineAnalysis, NoteEvent } from './types';
import { worldStateAt } from './world-state';

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
  beats: [0, 0.5, 1],
  chords: [],
  energy: [],
  notes: [note('a', 2, 64), note('b', 3, 67), note('c', 4, 71)],
};
const template = makeTemplate({});

describe('voice lines in the plan (I9)', () => {
  it('without edits, or with empty edits, the plan is unchanged', () => {
    const a = buildSpawnPlan(analysis, template, 5);
    const b = buildSpawnPlan(analysis, template, 5, EMPTY_EDITS);
    expect(b).toEqual(a);
    expect(a.records.slice(a.sceneryCount).every((r) => r.line === 'main' && r.lineY === 0 && r.colorHex === null)).toBe(true);
    expect(a.lines.map((l) => l.id)).toEqual(['main']);
  });

  it('a note moved to a new line is lifted, recolored and keeps the seed (others do not move)', () => {
    const base = buildSpawnPlan(analysis, template, 5);
    const l = addLine(EMPTY_EDITS, 'Harmony', '#00ff88')!;
    const edits = editNote(editNote(l.edits, 'b', { lineId: l.id }), 'b', { color: '#ff0000' });
    const plan = buildSpawnPlan(analysis, template, 5, edits);
    const at = (p: typeof plan, id: string) => p.records.find((r) => r.noteId === id)!;
    expect(at(plan, 'b').line).toBe(l.id);
    expect(at(plan, 'b').lineY).toBeGreaterThan(0);
    expect(at(plan, 'b').colorHex).toBe('#ff0000');
    expect(at(plan, 'a')).toEqual(at(base, 'a'));
    expect(at(plan, 'c')).toEqual(at(base, 'c'));
    expect(at(plan, 'b').target).toEqual(at(base, 'b').target);
    const s = worldStateAt(plan, 3);
    const onStaff = s.notesOnStaff.find((n) => plan.records[n.index]!.noteId === 'b');
    if (onStaff) {
      const r = at(plan, 'b');
      expect(onStaff.position.y).toBeCloseTo(staffNotePosition(plan.staff, onStaff.u, r.staffU, r.lineY).y);
    }
  });

  it('a rule with when.line matches only that line', () => {
    const l = addLine(EMPTY_EDITS, 'Harmony')!;
    const t = makeTemplate({
      mappings: [
        { when: { pitch: null, chord: null, stem: null, line: l.id, velocity: null }, spawn: 'spike', heightFrom: 'velocity', colorRole: null },
        { when: { pitch: null, chord: null, stem: null, line: null, velocity: null }, spawn: 'crystal', heightFrom: 'velocity', colorRole: null },
      ],
    });
    const edits = editNote(l.edits, 'b', { lineId: l.id });
    const plan = buildSpawnPlan(analysis, t, 5, edits);
    const kinds = Object.fromEntries(plan.records.slice(plan.sceneryCount).map((r) => [r.noteId, r.kind]));
    expect(kinds).toEqual({ a: 'crystal', b: 'spike', c: 'crystal' });
  });

  it('added notes appear in the plan and the same edits give the same plan', () => {
    const { edits } = addNote(EMPTY_EDITS, { time: 2.5, duration: 0.4, midi: 69, velocity: 0.6, lineId: 'main' });
    const p1 = buildSpawnPlan(analysis, template, 9, edits);
    expect(p1.records.some((r) => r.noteId === 'user:1')).toBe(true);
    expect(buildSpawnPlan(analysis, template, 9, edits)).toEqual(p1);
  });
});

describe('layer colors', () => {
  it('gives every layer a distinct hex color, so notes can be told apart by layer', async () => {
    const { LAYER_COLORS, LAYER_IDS } = await import('./layers');
    const colors = LAYER_IDS.map((id) => LAYER_COLORS[id]);
    expect(colors.every((c) => /^#[0-9a-f]{6}$/.test(c))).toBe(true);
    expect(new Set(colors).size).toBe(colors.length);
  });
});
