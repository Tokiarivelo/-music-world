import fc from 'fast-check';
import { describe, expect, it } from 'vitest';
import {
  EMPTY_EDITS,
  HISTORY_LIMIT,
  MAIN_LINE_ID,
  MAX_LINES,
  addLine,
  addNote,
  applyEdits,
  commit,
  deleteLine,
  editNote,
  newHistory,
  redo,
  resetAll,
  resetNote,
  snapToStaff,
  stepPitch,
  undo,
  updateLine,
  type LayoutEdits,
} from './edits';
import { staffUOf } from './spawn-plan';
import type { EngineAnalysis, NoteEvent } from './types';

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
  notes: [note('a', 1, 64), note('b', 2, 67), note('c', 3, 71)],
};

describe('edits (I9)', () => {
  it('no edit leaves the notes equal and never mutates the analysis', () => {
    const frozen = JSON.stringify(analysis);
    const out = applyEdits(analysis, EMPTY_EDITS);
    expect(out.analysis.notes).toEqual(analysis.notes);
    expect([...out.lineOf.values()].every((l) => l === MAIN_LINE_ID)).toBe(true);
    applyEdits(analysis, editNote(EMPTY_EDITS, 'a', { midi: 72, deleted: false }));
    expect(JSON.stringify(analysis)).toBe(frozen);
  });

  it('moves, deletes, recolors and ignores unknown ids', () => {
    let e = editNote(EMPTY_EDITS, 'a', { midi: 72, color: '#ff0000' });
    e = editNote(e, 'b', { deleted: true });
    e = editNote(e, 'nope', { midi: 10 });
    const out = applyEdits(analysis, e);
    expect(out.analysis.notes.map((n) => [n.id, n.midi])).toEqual([
      ['a', 72],
      ['c', 71],
    ]);
    expect(out.colorOf.get('a')).toBe('#ff0000');
  });

  it('added notes get user ids, sort by time, and join their line; deleting a line moves them back', () => {
    const l = addLine(EMPTY_EDITS, 'Harmony', '#00ff00')!;
    const a = addNote(l.edits, { time: 0.5, duration: 1, midi: 60, velocity: 0.5, lineId: l.id });
    expect(a.id).toBe('user:1');
    let out = applyEdits(analysis, a.edits);
    expect(out.analysis.notes[0]!.id).toBe('user:1');
    expect(out.lineOf.get('user:1')).toBe(l.id);
    out = applyEdits(analysis, deleteLine(a.edits, l.id));
    expect(out.lineOf.get('user:1')).toBe(MAIN_LINE_ID);
  });

  it('caps lines at 8 and never deletes the main line', () => {
    let e: LayoutEdits = EMPTY_EDITS;
    for (let i = 0; i < 20; i += 1) e = addLine(e, `L${i}`)?.edits ?? e;
    expect(e.lines.length).toBe(MAX_LINES - 1);
    expect(deleteLine(e, MAIN_LINE_ID)).toBe(e);
    expect(updateLine(e, 'missing', { name: 'x' })).toBe(e);
  });

  it('unknown line ids fall back to the main line', () => {
    const out = applyEdits(analysis, editNote(EMPTY_EDITS, 'a', { lineId: 'ghost' }));
    expect(out.lineOf.get('a')).toBe(MAIN_LINE_ID);
  });

  it('resetNote restores the analysis note', () => {
    const e = resetNote(editNote(EMPTY_EDITS, 'a', { midi: 80 }), 'a');
    expect(applyEdits(analysis, e).analysis.notes).toEqual(analysis.notes);
  });

  it('steps are diatonic: E4 up one is F4, up two is G4, down one is D4', () => {
    expect(stepPitch(64, 1)).toBe(65);
    expect(stepPitch(64, 2)).toBe(67);
    expect(stepPitch(64, -1)).toBe(62);
    expect(stepPitch(61, 0)).toBe(60); // off-scale snaps down to the scale
    expect(stepPitch(60, 7)).toBe(72);
  });

  it('snapToStaff hits the lines and spaces: bottom line E4, top line F5', () => {
    expect(snapToStaff(0)).toBe(64);
    expect(snapToStaff(1)).toBe(77);
    expect(snapToStaff(0.5)).toBe(71); // middle line B4
  });

  it('property: stepping stays in range, round-trips on scale tones and lands on the staff grid', () => {
    fc.assert(
      fc.property(fc.integer({ min: 21, max: 108 }), fc.integer({ min: -12, max: 12 }), (midi, steps) => {
        const p = stepPitch(midi, steps);
        expect(p).toBeGreaterThanOrEqual(21);
        expect(p).toBeLessThanOrEqual(108);
        expect(stepPitch(p, 0)).toBe(p);
        if (midi > 50 && midi < 80) expect(stepPitch(p, -steps)).toBe(stepPitch(midi, 0));
      }),
    );
    fc.assert(
      fc.property(fc.double({ min: -0.7, max: 1.7, noNaN: true }), (u) => {
        const m = snapToStaff(u);
        expect(Math.abs(staffUOf(m) - u)).toBeLessThanOrEqual(0.1);
      }),
    );
  });

  it('history: undo / redo round trip, limit, redo cleared by a new edit, reset is undoable', () => {
    let h = newHistory();
    const e1 = editNote(EMPTY_EDITS, 'a', { midi: 70 });
    h = commit(h, e1);
    h = commit(h, editNote(e1, 'b', { midi: 71 }));
    expect(undo(undo(h)).present).toBe(EMPTY_EDITS);
    expect(redo(undo(h)).present).toBe(h.present);
    expect(undo(newHistory())).toEqual(newHistory());
    const forked = commit(undo(h), editNote(e1, 'c', { midi: 60 }));
    expect(forked.future).toEqual([]);
    expect(undo(resetAll(h)).present).toBe(h.present);
    let big = newHistory();
    for (let i = 0; i < 80; i += 1) big = commit(big, editNote(big.present, 'a', { midi: 30 + i }));
    expect(big.past.length).toBe(HISTORY_LIMIT);
    expect(commit(big, big.present)).toBe(big);
  });

  it('property: the plan from the same edits is deterministic', () => {
    fc.assert(
      fc.property(fc.array(fc.tuple(fc.constantFrom('a', 'b', 'c'), fc.integer({ min: 21, max: 108 })), { maxLength: 8 }), (moves) => {
        const e = moves.reduce((acc, [id, midi]) => editNote(acc, id, { midi }), EMPTY_EDITS);
        expect(applyEdits(analysis, e)).toEqual(applyEdits(analysis, e));
      }),
    );
  });
});

import { duplicateLine, moveLine, linesOf, noteName } from './edits';

describe('edits: line order and names (I9)', () => {
  it('names pitches with their octave', () => {
    expect(noteName(60)).toBe('C4');
    expect(noteName(69)).toBe('A4');
    expect(noteName(61)).toBe('C♯4');
  });

  it('duplicates a line one unit higher and reorders lines', () => {
    const a = addLine(EMPTY_EDITS, 'A', '#112233')!;
    const d = duplicateLine(a.edits, a.id, 'A copy')!;
    const lines = linesOf(d.edits);
    expect(lines.map((l) => l.name)).toEqual(['Main', 'A', 'A copy']);
    expect(lines[2]!.color).toBe('#112233');
    expect(lines[2]!.height).toBe(lines[1]!.height + 1);
    const moved = moveLine(d.edits, d.id, -1);
    expect(linesOf(moved).map((l) => l.name)).toEqual(['Main', 'A copy', 'A']);
    expect(moveLine(d.edits, MAIN_LINE_ID, -1)).toBe(d.edits);
    expect(duplicateLine(EMPTY_EDITS, 'missing', 'x')).toBeNull();
  });
});

import { parseEdits } from './edits';

describe('parseEdits (I9)', () => {
  it('round-trips a valid document and rejects other values', () => {
    const l = addLine(EMPTY_EDITS, 'Harmony', '#00ff88')!;
    const withNote = editNote(l.edits, 'a', { midi: 70, color: '#ff0000', lineId: l.id });
    const doc = addNote(withNote, { time: 1, duration: 0.5, midi: 60, velocity: 0.5, lineId: 'main' }).edits;
    expect(parseEdits(JSON.parse(JSON.stringify(doc)))).toEqual(doc);
    for (const bad of [null, 3, 'x', [], { version: 2 }, {}]) expect(parseEdits(bad)).toBeNull();
  });

  it('drops invalid entries and clamps numbers instead of failing', () => {
    const parsed = parseEdits({
      version: 1,
      lines: [{ id: 'BAD ID', name: 'x' }, { id: 'ok', name: 'Fine', color: 'red', height: 99 }],
      notes: [{ noteId: 'a', midi: 500, velocity: 7, color: 'nope' }, { midi: 60 }],
      added: [{ id: 'user:1' }, { id: 'user:2', time: 1, duration: 1, midi: 60, velocity: 1, lineId: 'main' }],
    })!;
    expect(parsed.lines).toHaveLength(1);
    expect(parsed.lines[0]).toMatchObject({ id: 'ok', height: 8 });
    expect(parsed.lines[0]).not.toHaveProperty('color');
    expect(parsed.notes).toEqual([{ noteId: 'a', midi: 108, velocity: 1 }]);
    expect(parsed.added.map((a) => a.id)).toEqual(['user:2']);
  });
});
