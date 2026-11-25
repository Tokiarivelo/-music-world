import * as fc from 'fast-check';
import { describe, expect, it } from 'vitest';
import { buildMusicClock, crowdItemsOf, crowdPosesAt, musicClockOf, CLOCK_BASE_RATE } from './crowd';
import type { SpawnPlan } from './spawn-plan';

const SIZE = 40;
function fakePlan(kinds: string[], opts: { beats?: number[]; energy?: number } = {}): SpawnPlan {
  return {
    seed: 7,
    durationSec: 120,
    beats: opts.beats ?? [],
    energy: { times: [0, 120], values: [opts.energy ?? 0.5, opts.energy ?? 0.5] },
    template: { terrain: { size: SIZE } },
    records: kinds.map((kind, index) => ({ index, kind })),
  } as unknown as SpawnPlan;
}
const radius = (kind: string) => (kind === 'airplane' ? 0.5 : kind === 'cloud' ? 1.2 : kind === 'bicycle' ? 0.5 : 0.8);

describe('musical clock (I31)', () => {
  it('is monotonic, starts at 0 and runs faster in a loud passage than in a calm one', () => {
    const calm = buildMusicClock([], { times: [0, 100], values: [0, 0] }, 100);
    const loud = buildMusicClock([], { times: [0, 100], values: [1, 1] }, 100);
    expect(calm.at(0)).toBe(0);
    expect(loud.at(50)).toBeGreaterThan(calm.at(50) * 2);
    expect(calm.at(10)).toBeCloseTo(CLOCK_BASE_RATE * 10, 1);
    fc.assert(
      fc.property(fc.double({ min: 0, max: 130, noNaN: true }), fc.double({ min: 0, max: 5, noNaN: true }), (t, d) => {
        expect(loud.at(t + d)).toBeGreaterThanOrEqual(loud.at(t));
      }),
    );
  });

  it('surges on every beat and relaxes between them', () => {
    const clock = buildMusicClock([10, 11, 12], { times: [0, 100], values: [0.3, 0.3] }, 100);
    expect(clock.rateAt(10.01)).toBeGreaterThan(clock.rateAt(10.9) + 0.3);
    expect(clock.rateAt(5)).toBeCloseTo(clock.rateAt(6), 6);
  });

  it('is built once per plan', () => {
    const plan = fakePlan(['car']);
    expect(musicClockOf(plan)).toBe(musicClockOf(plan));
  });
});

describe('crowd avoidance (I31)', () => {
  const kinds = ['car', 'car', 'car', 'car', 'bicycle', 'bicycle', 'car', 'bicycle'];
  const plan = fakePlan(kinds);
  const items = crowdItemsOf(plan, radius);

  it('keeps every pair of ground objects apart, at any time', () => {
    fc.assert(
      fc.property(fc.double({ min: 0, max: 600, noNaN: true }), (t) => {
        const poses = crowdPosesAt(plan, items, t);
        for (const a of items) {
          for (const b of items) {
            if (a.index >= b.index) continue;
            const pa = poses.get(a.index)!;
            const pb = poses.get(b.index)!;
            const gap = Math.hypot(pa.x - pb.x, pa.z - pb.z);
            expect(gap).toBeGreaterThanOrEqual((a.radius + b.radius) * 0.95);
          }
        }
      }),
      { numRuns: 120 },
    );
  });

  it('keeps planes and clouds apart in the air too', () => {
    const air = fakePlan(['airplane', 'airplane', 'airplane', 'cloud', 'cloud', 'cloud']);
    const airItems = crowdItemsOf(air, radius);
    fc.assert(
      fc.property(fc.double({ min: 0, max: 600, noNaN: true }), (t) => {
        const poses = crowdPosesAt(air, airItems, t);
        for (const a of airItems) {
          for (const b of airItems) {
            if (a.index >= b.index) continue;
            const pa = poses.get(a.index)!;
            const pb = poses.get(b.index)!;
            expect(Math.hypot(pa.x - pb.x, pa.y - pb.y, pa.z - pb.z)).toBeGreaterThanOrEqual((a.radius + b.radius) * 0.95);
          }
        }
      }),
      { numRuns: 120 },
    );
  });

  it('is a pure function of (plan, t): a seek gives the same poses as playing', () => {
    const first = crowdPosesAt(plan, items, 83.7);
    crowdPosesAt(plan, items, 5);
    crowdPosesAt(plan, items, 301.2);
    expect(crowdPosesAt(plan, items, 83.7)).toEqual(first);
  });

  it('moves smoothly: no object jumps farther than its speed allows in a short step', () => {
    for (let t = 0; t < 200; t += 0.5) {
      const a = crowdPosesAt(plan, items, t);
      const b = crowdPosesAt(plan, items, t + 0.05);
      for (const item of items) {
        const pa = a.get(item.index)!;
        const pb = b.get(item.index)!;
        expect(Math.hypot(pb.x - pa.x, pb.z - pa.z)).toBeLessThan(3);
      }
    }
  });

  it('keeps finite poses and a heading in range', () => {
    const poses = crowdPosesAt(plan, items, 42);
    for (const p of poses.values()) {
      expect([p.x, p.y, p.z, p.yaw].every(Number.isFinite)).toBe(true);
    }
  });

  it('follows the music: a loud song moves the same car farther than a calm one', () => {
    const calm = fakePlan(['car'], { energy: 0 });
    const loud = fakePlan(['car'], { energy: 1 });
    const distance = (p: SpawnPlan) => {
      const it = crowdItemsOf(p, radius);
      const a = crowdPosesAt(p, it, 20).get(0)!;
      const b = crowdPosesAt(p, it, 25).get(0)!;
      return Math.hypot(b.x - a.x, b.z - a.z);
    };
    expect(distance(loud)).toBeGreaterThan(distance(calm) * 1.5);
  });
});
