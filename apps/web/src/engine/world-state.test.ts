import { describe, expect, it } from 'vitest';
import { makeTemplate } from './__fixtures__/templates';
import { buildSpawnPlan } from './spawn-plan';
import { staffNotePosition } from './staff';
import type { EngineAnalysis, NoteEvent } from './types';
import { lowerBound, upperBound, worldStateAt } from './world-state';

function analysisOf(notes: NoteEvent[], extra: Partial<EngineAnalysis> = {}): EngineAnalysis {
  return { durationSec: 60, tempoBpm: 120, beats: [], notes, chords: [], energy: [], ...extra };
}

const NOTE: NoteEvent = { id: 'n_0000', time: 10, duration: 1, midi: 60, velocity: 0.5, stem: 'other', chordId: null };
const TPL = makeTemplate({ staff: { lookahead: 4, fallDuration: 0.5 } });

describe('binary search helpers', () => {
  it('bound sorted arrays', () => {
    const v = [1, 2, 2, 3];
    expect([lowerBound(v, 2), upperBound(v, 2), lowerBound(v, 0), upperBound(v, 9)]).toEqual([1, 3, 0, 4]);
  });
});

describe('worldStateAt phases of one note (req 3.2, 3.3, 3.5)', () => {
  const plan = buildSpawnPlan(analysisOf([NOTE]), TPL, 1);
  const rec = plan.records[0]!;
  const at = (t: number) => worldStateAt(plan, t);

  it('is invisible before onset - lookahead', () => {
    const s = at(5.99);
    expect([s.notesOnStaff.length, s.fallingNotes.length, s.structures.length, s.spawnedCount]).toEqual([0, 0, 0, 0]);
    expect(at(6).notesOnStaff).toHaveLength(0);
  });

  it('slides on the staff from the far end to the playhead', () => {
    const half = at(8).notesOnStaff;
    expect(half).toHaveLength(1);
    expect(half[0]!.u).toBeCloseTo(plan.staff.playheadU + 0.5 * (1 - plan.staff.playheadU), 12);
    expect(half[0]!.position).toEqual(staffNotePosition(plan.staff, half[0]!.u, rec.staffU));
    const nearEnd = at(6.0001).notesOnStaff[0]!;
    const nearPlayhead = at(9.9999).notesOnStaff[0]!;
    expect(nearEnd.u).toBeGreaterThan(0.99);
    expect(nearPlayhead.u).toBeCloseTo(plan.staff.playheadU, 3);
  });

  it('falls from the playhead to its target in fallDuration seconds', () => {
    const start = at(10);
    expect(start.notesOnStaff).toHaveLength(0);
    expect(start.fallingNotes[0]!.progress).toBe(0);
    expect(start.fallingNotes[0]!.position).toEqual(staffNotePosition(plan.staff, plan.staff.playheadU, rec.staffU));
    const mid = at(10.25).fallingNotes[0]!;
    expect(mid.progress).toBeCloseTo(0.5, 12);
    const late = at(10.4999).fallingNotes[0]!;
    expect(Math.hypot(late.position.x - rec.target.x, late.position.z - rec.target.z)).toBeLessThan(0.05);
  });

  it('then grows over max(0.2, duration) and stays alive at full height', () => {
    const landing = at(10.5);
    expect(landing.fallingNotes).toHaveLength(0);
    expect(landing.structures[0]).toMatchObject({ phase: 'growing', growth: 0, height: 0 });
    expect(landing.spawnedCount).toBe(1);
    const growing = at(11);
    expect(growing.structures[0]!.phase).toBe('growing');
    expect(growing.structures[0]!.growth).toBeCloseTo(0.5, 12);
    const alive = at(30);
    expect(alive.structures[0]).toMatchObject({ phase: 'alive', growth: 1, height: rec.height, position: rec.target });
  });

  it('scales height and emissive with velocity', () => {
    const soft = buildSpawnPlan(analysisOf([{ ...NOTE, velocity: 0.1 }]), TPL, 1).records[0]!;
    const loud = buildSpawnPlan(analysisOf([{ ...NOTE, velocity: 0.9 }]), TPL, 1).records[0]!;
    expect(loud.height).toBeGreaterThan(soft.height);
    expect(loud.emissive).toBeGreaterThan(soft.emissive);
  });

  it('rejects a non-finite time', () => {
    expect(() => at(Number.NaN)).toThrow(RangeError);
  });
});

describe('slot reuse over budget (req 1.5)', () => {
  it('keeps only the newest `budget` structures of a kind, on distinct slots', () => {
    const notes = Array.from({ length: 7 }, (_, i) => ({ ...NOTE, id: `n_${i}`, time: i }));
    const plan = buildSpawnPlan(analysisOf(notes), makeTemplate({ budget: { instancesPerKind: 3 } }), 1);
    const s = worldStateAt(plan, 100);
    expect(s.spawnedCount).toBe(7);
    expect(s.structures.map((x) => plan.records[x.index]!.noteId)).toEqual(['n_4', 'n_5', 'n_6']);
    expect(s.structures.map((x) => x.slot)).toEqual([1, 2, 0]);
  });
});

describe('arcs and pulses (req 1.3, 4.2)', () => {
  const chordNotes = [0, 1, 2].map((k) => ({ ...NOTE, id: `n_${k}`, midi: 60 + 4 * k, chordId: 'c_0' }));
  const analysis = analysisOf(chordNotes, {
    chords: [{ id: 'c_0', time: 10, duration: 2, label: 'C', noteIds: ['n_0', 'n_1', 'n_2'] }],
    beats: [10, 10.5],
    energy: [
      { time: 0, value: 0 },
      { time: 20, value: 1 },
    ],
  });

  it('links chord structures with arcs that fade in after landing and out after the chord', () => {
    const plan = buildSpawnPlan(analysis, TPL, 1);
    expect(worldStateAt(plan, 10.4).arcs).toHaveLength(0);
    const on = worldStateAt(plan, 11.5).arcs;
    expect(on).toHaveLength(2);
    expect(on.every((a) => a.groupId === 'c_0' && a.intensity === 1)).toBe(true);
    expect(worldStateAt(plan, 12.25).arcs[0]!.intensity).toBeCloseTo(0.5, 12);
    expect(worldStateAt(plan, 12.5).arcs).toHaveLength(0);
    const none = buildSpawnPlan(analysis, makeTemplate({ fx: { chordLinks: 'none' } }), 1);
    expect(worldStateAt(none, 11.5).arcs).toHaveLength(0);
  });

  it('pulses on kicks (beats without drums), decays, and interpolates energy', () => {
    const plan = buildSpawnPlan(analysis, TPL, 1);
    expect(worldStateAt(plan, 9).pulses.kick).toBe(0);
    expect(worldStateAt(plan, 10).pulses.kick).toBe(1);
    expect(worldStateAt(plan, 10.3).pulses.kick).toBeLessThan(worldStateAt(plan, 10.1).pulses.kick);
    expect(worldStateAt(plan, 10.5).pulses.kick).toBe(1);
    expect(worldStateAt(plan, 5).pulses.energy).toBeCloseTo(0.25, 12);
    const drums = analysisOf([{ ...NOTE, stem: 'drums', time: 3 }], { beats: [1] });
    expect(buildSpawnPlan(drums, TPL, 1).kicks).toEqual([3]);
    const noPulse = buildSpawnPlan(analysis, makeTemplate({ fx: { beatPulse: false } }), 1);
    expect(worldStateAt(noPulse, 10).pulses.kick).toBe(0);
  });
});
