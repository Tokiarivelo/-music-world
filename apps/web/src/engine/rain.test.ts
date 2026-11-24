import fc from 'fast-check';
import { describe, expect, it } from 'vitest';
import { makeTemplate } from './__fixtures__/templates';
import { rainPosition, rainSway } from './rain';
import { buildSpawnPlan } from './spawn-plan';
import { buildStaffPath } from './staff';
import type { EngineAnalysis, NoteEvent } from './types';
import { worldStateAt } from './world-state';

const hash = fc.integer({ min: 0, max: 0xffffffff });
const from = { x: 1, y: 4, z: -2 };
const to = { x: -2, y: 0.1, z: 3 };

describe('rain (I6)', () => {
  it('starts on the curtain and arrives exactly on the target, whatever the note', () => {
    fc.assert(
      fc.property(hash, fc.double({ min: 4, max: 40, noNaN: true }), (h, size) => {
        const a = rainPosition(from, to, h, 0, size);
        const b = rainPosition(from, to, h, 1, size);
        expect(a.x).toBeCloseTo(from.x, 9);
        expect(a.y).toBeCloseTo(from.y, 9);
        expect(a.z).toBeCloseTo(from.z, 9);
        expect(b.x).toBeCloseTo(to.x, 9);
        expect(b.y).toBeCloseTo(to.y, 9);
        expect(b.z).toBeCloseTo(to.z, 9);
      }),
    );
  });

  it('never rises: a drop only goes down, and accelerates', () => {
    fc.assert(
      fc.property(hash, (h) => {
        let last = Infinity;
        let lastStep = 0;
        for (let i = 0; i <= 20; i += 1) {
          const y = rainPosition(from, to, h, i / 20, 12).y;
          expect(y).toBeLessThanOrEqual(last + 1e-12);
          if (i > 0) expect(last - y).toBeGreaterThanOrEqual(lastStep - 1e-9);
          if (i > 0) lastStep = last - y;
          last = y;
        }
      }),
    );
  });

  it('keeps the sway small and different for two notes', () => {
    fc.assert(
      fc.property(hash, fc.double({ min: 0, max: 1, noNaN: true }), (h, p) => {
        const { dx, dz } = rainSway(h, p, 12);
        expect(Math.hypot(dx, dz)).toBeLessThanOrEqual(12 * 0.02 * Math.SQRT2 + 1e-9);
      }),
    );
    const a = rainSway(0x12345678, 0.5, 12);
    const b = rainSway(0x9abcdef0, 0.5, 12);
    expect(a.dx === b.dx && a.dz === b.dz).toBe(false);
  });

  it('clamps progress outside [0, 1]', () => {
    expect(rainPosition(from, to, 7, -3, 12)).toEqual(rainPosition(from, to, 7, 0, 12));
    expect(rainPosition(from, to, 7, 9, 12)).toEqual(rainPosition(from, to, 7, 1, 12));
  });
});

describe('aurora style in the engine', () => {
  const note = (id: string, time: number, midi: number): NoteEvent => ({ id, time, duration: 0.5, midi, velocity: 0.6, stem: 'other', chordId: null });
  const analysis: EngineAnalysis = {
    durationSec: 30,
    tempoBpm: 120,
    beats: [],
    notes: [note('a', 5, 60), note('b', 5.5, 67), note('c', 6, 72)],
    chords: [],
    energy: [],
  };
  const aurora = makeTemplate({ staff: { style: 'aurora', lookahead: 5, fallDuration: 1.4 } });
  const classic = makeTemplate({ staff: { style: 'glowing_lines', lookahead: 5, fallDuration: 1.4 } });

  it('hangs the staff high above the plate, higher than the classic staff', () => {
    expect(buildStaffPath(aurora).baseY).toBeGreaterThan(buildStaffPath(classic).baseY * 4);
    expect(buildStaffPath(aurora).lineGap).toBeGreaterThan(buildStaffPath(classic).lineGap);
  });

  it('lands each note exactly on its target and gives the same picture after a seek', () => {
    const plan = buildSpawnPlan(analysis, aurora, 42);
    const rec = plan.records[0]!;
    const falling = worldStateAt(plan, rec.onset + 0.7).fallingNotes[0]!;
    const direct = worldStateAt(plan, rec.onset + 0.7).fallingNotes[0]!;
    worldStateAt(plan, 20); // seek elsewhere, then back
    const again = worldStateAt(plan, rec.onset + 0.7).fallingNotes[0]!;
    expect(again.position).toEqual(falling.position);
    expect(direct.position).toEqual(falling.position);
    const last = worldStateAt(plan, rec.landAt - 1e-6).fallingNotes[0]!;
    expect(last.position.x).toBeCloseTo(rec.target.x, 3);
    expect(last.position.z).toBeCloseTo(rec.target.z, 3);
    expect(last.position.y).toBeCloseTo(rec.target.y, 3);
  });

  it('leaves the classic fall unchanged', () => {
    const plan = buildSpawnPlan(analysis, classic, 42);
    const rec = plan.records[0]!;
    const mid = worldStateAt(plan, rec.onset + 0.7).fallingNotes[0]!;
    // the classic fall still has its arc: higher than a straight line at the same progress
    const from = worldStateAt(plan, rec.onset).fallingNotes[0]!.position;
    const straightY = from.y + (rec.target.y - from.y) * mid.progress;
    expect(mid.position.y).toBeGreaterThan(straightY);
  });
});
