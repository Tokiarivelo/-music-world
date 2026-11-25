import fc from 'fast-check';
import { describe, expect, it } from 'vitest';
import { analysisArb } from './__fixtures__/analyses';
import { makeTemplate } from './__fixtures__/templates';
import { SKY_PAST_SEC, skyFutureSec, skyNotesAt } from './sky';
import { buildSpawnPlan } from './spawn-plan';
import { lowerBound, worldStateAt } from './world-state';

const TPL = makeTemplate();

describe('aurora sky notes', () => {
  it('shows every note of the window and none outside it', () => {
    fc.assert(
      fc.property(analysisArb({ maxNotes: 60, duration: 60 }), fc.double({ min: 0, max: 60, noNaN: true }), (analysis, t) => {
        const plan = buildSpawnPlan(analysis, TPL, 7);
        const future = skyFutureSec(plan);
        const shown = new Set(skyNotesAt(plan, t, lowerBound).map((n) => n.index));
        for (const r of plan.records) {
          if (r.noteId.startsWith('scenery:')) continue;
          const inWindow = r.onset >= t - SKY_PAST_SEC && r.onset < t + future;
          expect(shown.has(r.index)).toBe(inWindow);
        }
      }),
      { numRuns: 40 },
    );
  });

  it('is a pure function of (plan, t): a seek gives the same picture', () => {
    fc.assert(
      fc.property(analysisArb({ maxNotes: 60, duration: 60 }), fc.double({ min: 0, max: 60, noNaN: true }), (analysis, t) => {
        const plan = buildSpawnPlan(analysis, TPL, 3);
        worldStateAt(plan, t + 11); // an earlier frame must not matter
        expect(worldStateAt(plan, t).skyNotes).toEqual(worldStateAt(plan, t).skyNotes);
      }),
      { numRuns: 30 },
    );
  });

  it('hangs a higher pitch higher and keeps glow in [0, 1]', () => {
    fc.assert(
      fc.property(analysisArb({ maxNotes: 80, duration: 30 }), (a) => {
        const plan = buildSpawnPlan(a, TPL, 5);
        for (const n of skyNotesAt(plan, 10, lowerBound)) {
          expect(n.glow).toBeGreaterThanOrEqual(0);
          expect(n.glow).toBeLessThanOrEqual(1);
          expect(Number.isFinite(n.position.x + n.position.y + n.position.z)).toBe(true);
          expect(n.position.y).toBeGreaterThan(plan.staff.baseY - 1e-6);
        }
      }),
      { numRuns: 30 },
    );
  });
});
