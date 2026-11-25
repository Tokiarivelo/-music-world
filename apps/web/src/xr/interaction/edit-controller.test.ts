import { beforeEach, describe, expect, it, vi } from 'vitest';
import { makeTemplate } from '@/engine/__fixtures__/templates';
import { buildSpawnPlan } from '@/engine/spawn-plan';
import type { EngineAnalysis, NoteEvent } from '@/engine/types';
import { worldStateAt } from '@/engine/world-state';
import { editStore } from '../edit-store';
import { DRAG_THRESHOLD_PX, EditController, type NoteEditEvent } from './edit-controller';

const note = (id: string, time: number, midi: number): NoteEvent => ({
  id, time, duration: 0.5, midi, velocity: 0.7, stem: 'other', chordId: null,
});
const analysis: EngineAnalysis = {
  durationSec: 20, tempoBpm: 120, beats: [], chords: [], energy: [],
  notes: [note('a', 3, 64), note('b', 3.5, 71)],
};
const plan = buildSpawnPlan(analysis, makeTemplate({}), 1);
const T = 2.5;
const state = worldStateAt(plan, T);
const project = (p: { x: number; y: number; z: number }) => ({ x: p.x * 40, y: -p.y * 400 });

function setup() {
  const events: NoteEditEvent[] = [];
  const synth = { playNote: vi.fn(() => true) };
  let paused = true;
  const c = new EditController({
    plan: () => plan,
    now: () => T,
    hidden: () => new Set(),
    project,
    synth,
    emit: (e) => events.push(e),
  });
  c.setEnabled(paused);
  return { c, events, synth, setPaused: (p: boolean) => { paused = p; c.setEnabled(p); } };
}
const screenOf = (index: number) => project(state.notesOnStaff.find((n) => n.index === index)!.position);
const first = state.notesOnStaff[0]!.index;

describe('edit controller (I9)', () => {
  beforeEach(() => editStore.reset());

  it('there are notes to pick in the test frame', () => {
    expect(state.notesOnStaff.length).toBeGreaterThan(0);
  });

  it('does nothing while disabled (playing): no capture, no sound', () => {
    const { c, synth, setPaused } = setup();
    setPaused(false);
    expect(c.pointerDown(screenOf(first))).toBe(false);
    expect(synth.playNote).not.toHaveBeenCalled();
    expect(c.capturing).toBe(false);
  });

  it('hover highlights, click plays the pitch and selects without moving it', () => {
    const { c, events, synth } = setup();
    const s = screenOf(first);
    c.pointerMove(s);
    expect(editStore.state.hover).toBe(plan.records[first]!.noteId);
    expect(c.pointerDown(s)).toBe(true);
    expect(c.capturing).toBe(true);
    expect(synth.playNote).toHaveBeenCalledWith(plan.records[first]!.midi, plan.records[first]!.velocity);
    c.pointerUp();
    expect(c.capturing).toBe(false);
    expect(events.some((e) => e.type === 'committed')).toBe(false);
    expect(editStore.state.selection).toEqual([plan.records[first]!.noteId]);
  });

  it('a press on empty space is not captured (the camera keeps it)', () => {
    const { c } = setup();
    expect(c.pointerDown({ x: -5000, y: -5000 })).toBe(false);
    expect(c.capturing).toBe(false);
  });

  it('dragging up snaps to a higher pitch, shows a ghost, commits on release and plays it', () => {
    const { c, events, synth } = setup();
    const s = screenOf(first);
    const oldMidi = plan.records[first]!.midi;
    c.pointerDown(s);
    c.pointerMove({ x: s.x, y: s.y - DRAG_THRESHOLD_PX - 1 }); // beyond the threshold, tiny move
    c.pointerMove({ x: s.x, y: s.y - 120 });
    expect(editStore.state.ghost?.noteId).toBe(plan.records[first]!.noteId);
    const ghost = editStore.state.ghost!.midi;
    expect(ghost).toBeGreaterThan(oldMidi);
    c.pointerUp();
    expect(events.at(-1)).toMatchObject({ type: 'committed', moves: [{ noteId: plan.records[first]!.noteId }] });
    expect(events.at(-1)).toHaveProperty('moves.0.midi');
    expect(synth.playNote).toHaveBeenLastCalledWith(ghost, plan.records[first]!.velocity);
    expect(editStore.state.ghost).toBeNull();
  });

  it('dragging along the staff moves the note in time and commits the new onset on release', () => {
    const { c, events } = setup();
    const s = screenOf(first);
    const r = plan.records[first]!;
    c.pointerDown(s);
    c.pointerMove({ x: s.x + DRAG_THRESHOLD_PX + 1, y: s.y });
    c.pointerMove({ x: s.x + 200, y: s.y });
    const dt = editStore.state.ghost?.dt ?? 0;
    expect(dt).not.toBe(0);
    c.pointerUp();
    const committed = events.at(-1) as Extract<NoteEditEvent, { type: 'committed' }>;
    expect(committed.type).toBe('committed');
    expect(committed.moves[0]!.midi).toBe(r.midi);
    expect(committed.moves[0]!.time).toBeCloseTo(Math.max(0, r.onset + dt), 6);
  });

  it('Esc cancels the drag and commits nothing', () => {
    const { c, events } = setup();
    const s = screenOf(first);
    c.pointerDown(s);
    c.pointerMove({ x: s.x, y: s.y - 150 });
    c.cancel();
    c.pointerUp();
    expect(events.some((e) => e.type === 'committed')).toBe(false);
    expect(events.at(-1)).toEqual({ type: 'cancelled' });
    expect(editStore.state.ghost).toBeNull();
  });

  it('disabling mid-drag aborts it and clears the view state', () => {
    const { c, setPaused } = setup();
    const s = screenOf(first);
    c.pointerDown(s);
    c.pointerMove({ x: s.x, y: s.y - 150 });
    setPaused(false);
    expect(c.capturing).toBe(false);
    expect(editStore.state).toMatchObject({ enabled: false, selection: [], ghost: null });
  });

  it('keyboard: select next, nudge one step up, play', () => {
    const { c, events, synth } = setup();
    c.selectRelative(1);
    expect(editStore.primary).not.toBeNull();
    const idx = plan.records.findIndex((r) => r.noteId === editStore.primary);
    c.nudge(1);
    const e = events.at(-1) as { type: string; moves: { noteId: string; midi: number }[] };
    expect(e.type).toBe('committed');
    expect(e.moves[0]!.noteId).toBe(plan.records[idx]!.noteId);
    expect(e.moves[0]!.midi).toBeGreaterThan(plan.records[idx]!.midi);
    c.playSelected();
    expect(synth.playNote).toHaveBeenLastCalledWith(plan.records[idx]!.midi, plan.records[idx]!.velocity);
  });

  it('Shift-click builds a multi-selection and a drag or step moves the whole group by the same steps', () => {
    const { c, events } = setup();
    const [n0, n1] = state.notesOnStaff;
    c.pointerDown(screenOf(n0!.index));
    c.pointerUp();
    expect(c.pointerDown(screenOf(n1!.index), true)).toBe(true);
    expect(c.capturing).toBe(false); // additive press never starts a drag
    expect(editStore.state.selection).toEqual([plan.records[n0!.index]!.noteId, plan.records[n1!.index]!.noteId]);
    c.nudge(2);
    const e = events.at(-1) as unknown as { moves: { noteId: string; midi: number }[] };
    expect(e.moves).toHaveLength(2);
    expect(e.moves[0]!.midi - plan.records[n0!.index]!.midi).toBeGreaterThan(0);
    // Shift-click again removes it
    c.pointerDown(screenOf(n1!.index), true);
    expect(editStore.state.selection).toEqual([plan.records[n0!.index]!.noteId]);
  });

  it('a press on empty space clears the selection', () => {
    const { c } = setup();
    c.pointerDown(screenOf(first));
    c.pointerUp();
    c.pointerDown({ x: -5000, y: -5000 });
    expect(editStore.state.selection).toEqual([]);
  });

  describe('VR ray', () => {
    const noteWorld = (index: number) => state.notesOnStaff.find((n) => n.index === index)!.position;
    const rayAt = (target: { x: number; y: number; z: number }) => {
      const origin = { x: target.x, y: target.y + 0.2, z: target.z + 1.5 };
      const v = { x: target.x - origin.x, y: target.y - origin.y, z: target.z - origin.z };
      const len = Math.hypot(v.x, v.y, v.z);
      return { origin, dir: { x: v.x / len, y: v.y / len, z: v.z / len } };
    };

    it('the trigger on a note plays and selects it, a ray into empty space is not captured', () => {
      const { c, synth } = setup();
      expect(c.rayDown({ origin: { x: 0, y: 50, z: 5 }, dir: { x: 0, y: 1, z: 0 } })).toBe(false);
      expect(c.rayDown(rayAt(noteWorld(first)))).toBe(true);
      expect(synth.playNote).toHaveBeenCalledWith(plan.records[first]!.midi, plan.records[first]!.velocity);
      expect(c.capturing).toBe(true);
      expect(editStore.state.selection).toEqual([plan.records[first]!.noteId]);
      c.rayUp();
      expect(c.capturing).toBe(false);
    });

    it('hovering with the ray highlights the note and does nothing while disabled', () => {
      const { c, setPaused } = setup();
      c.rayMove(rayAt(noteWorld(first)));
      expect(editStore.state.hover).toBe(plan.records[first]!.noteId);
      setPaused(false);
      expect(c.rayDown(rayAt(noteWorld(first)))).toBe(false);
    });

    it('raising the ray while the trigger is held moves the note up and commits on release', () => {
      const { c, events } = setup();
      const p = noteWorld(first);
      c.rayDown(rayAt(p));
      c.rayMove(rayAt({ ...p, y: p.y + 0.12 }));
      expect(editStore.state.ghost).not.toBeNull();
      c.rayUp();
      const committed = events.find((e) => e.type === 'committed');
      expect(committed).toBeDefined();
    });
  });
});
