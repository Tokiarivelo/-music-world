/**
 * User edits on top of an analysis (improvement I9). Pure and framework-free: edits are data, never a change to the
 * analysis; `applyEdits` returns a new analysis plus per-note line and color maps. Pitch moves snap to the diatonic
 * steps of the staff (one step = half a line gap).
 */
import { STAFF_BOTTOM_MIDI, STAFF_TOP_MIDI } from './constants';
import type { EngineAnalysis, NoteEvent } from './types';

export const MAIN_LINE_ID = 'main';
export const MAX_LINES = 8;
export const MAX_EDITS = 2000;
export const HISTORY_LIMIT = 50;
export const MIN_MIDI = 21;
export const MAX_MIDI = 108;

export type Clef = 'treble' | 'bass' | 'none';

export interface StaffLine {
  readonly id: string;
  readonly name: string;
  /** Hex color (`#rrggbb`); absent = follows the template palette. */
  readonly color?: string;
  readonly clef: Clef;
  /** Extra height in the sky, in staff gaps. */
  readonly height: number;
  readonly muted: boolean;
  readonly solo: boolean;
  readonly order: number;
}

export interface NoteEdit {
  readonly noteId: string;
  readonly midi?: number;
  readonly time?: number;
  readonly duration?: number;
  readonly velocity?: number;
  readonly color?: string;
  readonly lineId?: string;
  readonly deleted?: boolean;
}

export interface AddedNote {
  /** `user:<n>` */
  readonly id: string;
  readonly time: number;
  readonly duration: number;
  readonly midi: number;
  readonly velocity: number;
  readonly lineId: string;
  readonly color?: string;
}

export interface LayoutEdits {
  readonly version: 1;
  readonly lines: readonly StaffLine[];
  readonly notes: readonly NoteEdit[];
  readonly added: readonly AddedNote[];
}

export const EMPTY_EDITS: LayoutEdits = { version: 1, lines: [], notes: [], added: [] };

export function isEmptyEdits(e: LayoutEdits): boolean {
  return e.lines.length === 0 && e.notes.length === 0 && e.added.length === 0;
}

export interface EditedAnalysis {
  readonly analysis: EngineAnalysis;
  /** Line id of every note (`main` by default). */
  readonly lineOf: ReadonlyMap<string, string>;
  /** Own color overrides, by note id. */
  readonly colorOf: ReadonlyMap<string, string>;
}

function clamp(v: number, lo: number, hi: number): number {
  return Math.min(hi, Math.max(lo, v));
}

/** Lines in display order; the main line always exists. */
export function linesOf(edits: LayoutEdits): readonly StaffLine[] {
  const main: StaffLine = edits.lines.find((l) => l.id === MAIN_LINE_ID) ?? {
    id: MAIN_LINE_ID,
    name: 'Main',
    clef: 'treble',
    height: 0,
    muted: false,
    solo: false,
    order: 0,
  };
  const others = edits.lines.filter((l) => l.id !== MAIN_LINE_ID);
  return [main, ...others].slice(0, MAX_LINES).sort((a, b) => a.order - b.order);
}

/** Applies the edits; unknown note ids and unknown lines are ignored. Never mutates its inputs. */
export function applyEdits(analysis: EngineAnalysis, edits: LayoutEdits): EditedAnalysis {
  const lineIds = new Set(linesOf(edits).map((l) => l.id));
  const byId = new Map<string, NoteEdit>();
  for (const e of edits.notes.slice(0, MAX_EDITS)) byId.set(e.noteId, e);
  const lineOf = new Map<string, string>();
  const colorOf = new Map<string, string>();
  const notes: NoteEvent[] = [];

  const lineFor = (id: string | undefined): string => (id !== undefined && lineIds.has(id) ? id : MAIN_LINE_ID);

  for (const n of analysis.notes) {
    const e = byId.get(n.id);
    if (e?.deleted === true) continue;
    const edited: NoteEvent = e
      ? {
          ...n,
          midi: e.midi !== undefined ? clamp(Math.round(e.midi), MIN_MIDI, MAX_MIDI) : n.midi,
          time: e.time !== undefined ? Math.max(0, e.time) : n.time,
          duration: e.duration !== undefined ? Math.max(0.01, e.duration) : n.duration,
          velocity: e.velocity !== undefined ? clamp(e.velocity, 0, 1) : n.velocity,
        }
      : n;
    notes.push(edited);
    lineOf.set(n.id, lineFor(e?.lineId));
    if (e?.color) colorOf.set(n.id, e.color);
  }

  for (const a of edits.added.slice(0, MAX_EDITS)) {
    const base = analysis.notes[0];
    if (!base) continue;
    notes.push({
      ...base,
      id: a.id,
      time: Math.max(0, a.time),
      duration: Math.max(0.01, a.duration),
      midi: clamp(Math.round(a.midi), MIN_MIDI, MAX_MIDI),
      velocity: clamp(a.velocity, 0, 1),
      chordId: null,
    } as NoteEvent);
    lineOf.set(a.id, lineFor(a.lineId));
    if (a.color) colorOf.set(a.id, a.color);
  }

  notes.sort((x, y) => x.time - y.time || x.midi - y.midi);
  return { analysis: { ...analysis, notes }, lineOf, colorOf };
}

// --- Pitch snapping -------------------------------------------------------------------------------------------------

/** Pitch classes of the C major scale (the staff lines are the white keys E4 … F5). */
const DIATONIC = [0, 2, 4, 5, 7, 9, 11] as const;

function degreeIndex(midi: number): number {
  // Absolute diatonic index of the nearest scale tone at or below `midi` (C0 = 0).
  const octave = Math.floor(midi / 12);
  const pc = midi - octave * 12;
  let d = 0;
  for (let i = 0; i < DIATONIC.length; i += 1) if (DIATONIC[i]! <= pc) d = i;
  return octave * 7 + d;
}

function midiOfDegree(index: number): number {
  const octave = Math.floor(index / 7);
  return octave * 12 + DIATONIC[index - octave * 7]!;
}

/** Moves a pitch by whole diatonic steps (a step is half a line gap). Off-scale pitches snap to the scale first. */
export function stepPitch(midi: number, steps: number): number {
  return clamp(midiOfDegree(degreeIndex(Math.round(midi)) + Math.round(steps)), MIN_MIDI, MAX_MIDI);
}

/** Nearest scale pitch for a vertical staff position (`staffU` 0 = bottom line, 1 = top line). */
export function snapToStaff(staffU: number): number {
  const steps = Math.round(staffU * 8); // 8 diatonic steps from E4 to F5
  return stepPitch(STAFF_BOTTOM_MIDI, steps);
}

/** Inverse of `snapToStaff` for a pitch: staff position in line gaps / 4 (unclamped). */
export function staffUOfSnapped(midi: number): number {
  return (degreeIndex(midi) - degreeIndex(STAFF_BOTTOM_MIDI)) / 8;
}

export { STAFF_TOP_MIDI };

// --- Document updates (all immutable) ----------------------------------------------------------------------------------

/** Merges a patch into the edit of a note (or an added note); an empty patch result removes the edit. */
export function editNote(edits: LayoutEdits, noteId: string, patch: Partial<Omit<NoteEdit, 'noteId'>>): LayoutEdits {
  if (noteId.startsWith('user:')) {
    return {
      ...edits,
      added: edits.added.flatMap((a) => {
        if (a.id !== noteId) return [a];
        if (patch.deleted === true) return [];
        return [
          {
            ...a,
            ...(patch.midi !== undefined && { midi: patch.midi }),
            ...(patch.time !== undefined && { time: patch.time }),
            ...(patch.duration !== undefined && { duration: patch.duration }),
            ...(patch.velocity !== undefined && { velocity: patch.velocity }),
            ...(patch.lineId !== undefined && { lineId: patch.lineId }),
            ...(patch.color !== undefined && { color: patch.color }),
          },
        ];
      }),
    };
  }
  const prev = edits.notes.find((e) => e.noteId === noteId);
  const merged: NoteEdit = { ...prev, ...patch, noteId };
  const rest = edits.notes.filter((e) => e.noteId !== noteId);
  return { ...edits, notes: [...rest, merged].slice(-MAX_EDITS) };
}

/** Removes every edit of a note ("Reset note"). */
export function resetNote(edits: LayoutEdits, noteId: string): LayoutEdits {
  return { ...edits, notes: edits.notes.filter((e) => e.noteId !== noteId) };
}

export function addNote(edits: LayoutEdits, note: Omit<AddedNote, 'id'>): { edits: LayoutEdits; id: string } {
  let n = edits.added.length + 1;
  while (edits.added.some((a) => a.id === `user:${n}`)) n += 1;
  const id = `user:${n}`;
  return { edits: { ...edits, added: [...edits.added, { ...note, id }].slice(0, MAX_EDITS) }, id };
}

export function addLine(edits: LayoutEdits, name: string, color?: string): { edits: LayoutEdits; id: string } | null {
  const lines = linesOf(edits);
  if (lines.length >= MAX_LINES) return null;
  let n = lines.length;
  while (lines.some((l) => l.id === `line-${n}`)) n += 1;
  const id = `line-${n}`;
  const line: StaffLine = {
    id,
    name,
    ...(color !== undefined && { color }),
    clef: 'treble',
    height: n,
    muted: false,
    solo: false,
    order: Math.max(...lines.map((l) => l.order)) + 1,
  };
  return { edits: { ...edits, lines: [...edits.lines, line] }, id };
}

export function updateLine(edits: LayoutEdits, lineId: string, patch: Partial<Omit<StaffLine, 'id'>>): LayoutEdits {
  const existing = linesOf(edits).find((l) => l.id === lineId);
  if (!existing) return edits;
  const next = { ...existing, ...patch };
  const others = edits.lines.filter((l) => l.id !== lineId);
  return { ...edits, lines: [...others, next] };
}

/** Deletes a line; its notes return to the main line. The main line cannot be deleted. */
export function deleteLine(edits: LayoutEdits, lineId: string): LayoutEdits {
  if (lineId === MAIN_LINE_ID) return edits;
  return {
    ...edits,
    lines: edits.lines.filter((l) => l.id !== lineId),
    notes: edits.notes.map((e) => (e.lineId === lineId ? { ...e, lineId: MAIN_LINE_ID } : e)),
    added: edits.added.map((a) => (a.lineId === lineId ? { ...a, lineId: MAIN_LINE_ID } : a)),
  };
}

// --- History -----------------------------------------------------------------------------------------------------------

export interface History {
  readonly past: readonly LayoutEdits[];
  readonly present: LayoutEdits;
  readonly future: readonly LayoutEdits[];
}

export function newHistory(present: LayoutEdits = EMPTY_EDITS): History {
  return { past: [], present, future: [] };
}

/** Commits a new document; a no-op change (same reference) leaves the history alone. */
export function commit(h: History, next: LayoutEdits): History {
  if (next === h.present) return h;
  return { past: [...h.past, h.present].slice(-HISTORY_LIMIT), present: next, future: [] };
}

export function undo(h: History): History {
  const prev = h.past[h.past.length - 1];
  if (!prev) return h;
  return { past: h.past.slice(0, -1), present: prev, future: [h.present, ...h.future] };
}

export function redo(h: History): History {
  const next = h.future[0];
  if (!next) return h;
  return { past: [...h.past, h.present].slice(-HISTORY_LIMIT), present: next, future: h.future.slice(1) };
}

/** "Reset edits": back to the analysis, undoable. */
export function resetAll(h: History): History {
  return commit(h, EMPTY_EDITS);
}
