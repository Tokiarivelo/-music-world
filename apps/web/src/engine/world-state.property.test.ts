// Property tests of 03-world-engine-core task 2.3 (requirements 1.5, 2.1–2.4).
import fc from 'fast-check';
import { describe, expect, it } from 'vitest';
import { analysisArb, bigAnalysis } from './__fixtures__/analyses';
import { makeTemplate, templateArb } from './__fixtures__/templates';
import { buildSpawnPlan } from './spawn-plan';
import type { EngineAnalysis } from './types';
import { worldStateAt } from './world-state';

const DURATION = 180;
const timeArb = fc.double({ min: -10, max: DURATION + 10, noNaN: true });

describe('determinism (req 2.4)', () => {
  it('the same analysis, template and seed give a deep-equal plan and identical states', () => {
    fc.assert(
      fc.property(analysisArb({ maxNotes: 150 }), templateArb(), fc.integer(), timeArb, (analysis, tpl, seed, t) => {
        const a = buildSpawnPlan(analysis, tpl, seed);
        // Rebuild from deep copies so no object identity is shared between the two runs.
        const b = buildSpawnPlan(structuredClone(analysis), structuredClone(tpl), seed);
        expect(b).toEqual(a);
        expect(worldStateAt(b, t)).toEqual(worldStateAt(a, t));
      }),
      { numRuns: 60 },
    );
  });

  it('does not depend on the order of the input notes and chords', () => {
    fc.assert(
      fc.property(analysisArb({ maxNotes: 120 }), templateArb(), fc.integer(), (analysis, tpl, seed) => {
        const shuffled: EngineAnalysis = {
          ...analysis,
          notes: [...analysis.notes].reverse(),
          chords: [...analysis.chords].reverse(),
        };
        expect(buildSpawnPlan(shuffled, tpl, seed)).toEqual(buildSpawnPlan(analysis, tpl, seed));
      }),
      { numRuns: 40 },
    );
  });
});

describe('purity and seek equivalence (req 2.1, 2.2)', () => {
  it('any sequence of calls leaves the plan untouched and returns the same state as a fresh call', () => {
    fc.assert(
      fc.property(
        analysisArb({ maxNotes: 150 }),
        templateArb(),
        fc.array(timeArb, { minLength: 1, maxLength: 25 }),
        timeArb,
        (analysis, tpl, history, t) => {
          const plan = buildSpawnPlan(analysis, tpl, 11);
          const fresh = worldStateAt(buildSpawnPlan(analysis, tpl, 11), t);
          const snapshot = JSON.stringify(plan);
          for (const h of history) worldStateAt(plan, h); // play, pause, seek back and forth
          expect(worldStateAt(plan, t)).toEqual(fresh);
          expect(JSON.stringify(plan)).toBe(snapshot);
        },
      ),
      { numRuns: 60 },
    );
  });

  it('playing forward frame by frame ends in the same state as seeking directly', () => {
    fc.assert(
      fc.property(
        analysisArb({ maxNotes: 80, duration: 20 }),
        templateArb(),
        fc.double({ min: 0, max: 20, noNaN: true }),
        (analysis, tpl, t) => {
          const plan = buildSpawnPlan(analysis, tpl, 2);
          let last = worldStateAt(plan, 0);
          for (let frame = 0; frame * (1 / 72) < t; frame++) last = worldStateAt(plan, frame / 72);
          last = worldStateAt(plan, t);
          expect(last).toEqual(worldStateAt(buildSpawnPlan(analysis, tpl, 2), t));
        },
      ),
      { numRuns: 15 },
    );
  });
});

describe('monotonicity (req 2.3)', () => {
  it('the number of spawned structures never decreases with t', () => {
    fc.assert(
      fc.property(analysisArb({ maxNotes: 200 }), templateArb(), timeArb, timeArb, (analysis, tpl, a, b) => {
        const plan = buildSpawnPlan(analysis, tpl, 4);
        const [t1, t2] = a <= b ? [a, b] : [b, a];
        expect(worldStateAt(plan, t2).spawnedCount).toBeGreaterThanOrEqual(worldStateAt(plan, t1).spawnedCount);
      }),
      { numRuns: 100 },
    );
  });

  it('every note is in exactly one phase: hidden, on staff, falling, or landed', () => {
    fc.assert(
      fc.property(analysisArb({ maxNotes: 150 }), templateArb(), timeArb, (analysis, tpl, t) => {
        const plan = buildSpawnPlan(analysis, tpl, 6);
        const s = worldStateAt(plan, t);
        const onStaff = new Set(s.notesOnStaff.map((n) => n.index));
        const falling = new Set(s.fallingNotes.map((n) => n.index));
        let landed = 0;
        for (const r of plan.records) {
          const expectStaff = r.onset > t && r.onset - plan.lookahead < t;
          const expectFall = r.onset <= t && t < r.landAt;
          expect(onStaff.has(r.index)).toBe(expectStaff);
          expect(falling.has(r.index)).toBe(expectFall);
          if (r.landAt <= t) landed++;
        }
        expect(s.spawnedCount).toBe(landed);
      }),
      { numRuns: 100 },
    );
  });
});

describe('budget (req 1.5)', () => {
  it('live structures per kind stay within the budget, on distinct slots, newest kept', () => {
    fc.assert(
      fc.property(analysisArb({ maxNotes: 300 }), templateArb(), timeArb, (analysis, tpl, t) => {
        const plan = buildSpawnPlan(analysis, tpl, 8);
        const s = worldStateAt(plan, t);
        for (const track of plan.tracks) {
          const live = s.structures.filter((x) => x.kind === track.kind);
          expect(live.length).toBeLessThanOrEqual(plan.budget);
          expect(new Set(live.map((x) => x.slot)).size).toBe(live.length);
          const landed = track.recordIndices.filter((i) => plan.records[i]!.landAt <= t);
          expect(live.map((x) => x.index)).toEqual(landed.slice(Math.max(0, landed.length - plan.budget)));
        }
      }),
      { numRuns: 100 },
    );
  });

  it('holds for 20 000 notes with the default budget', () => {
    const big = bigAnalysis(20_000, 42);
    const plan = buildSpawnPlan(
      big,
      makeTemplate({
        mappings: [
          { when: { pitch: '<64' }, spawn: 'crystal' },
          { when: {}, spawn: 'spike' },
        ],
      }),
      1,
    );
    for (const t of [0, 60, 120, DURATION]) {
      const s = worldStateAt(plan, t);
      for (const kind of ['crystal', 'spike']) {
        expect(s.structures.filter((x) => x.kind === kind).length).toBeLessThanOrEqual(2000);
      }
    }
    expect(worldStateAt(plan, DURATION + 10).structures.length).toBe(4000);
  });
});
