import { describe, expect, it } from 'vitest';
import { crowdItemsOf } from './crowd';
import { objectPoseAt } from './motion';
import { SWIMMERS, swimAt } from './swim';

const SIZE = 14;
const pose = (kind: string, i: number, t: number) => swimAt(kind, 7, `${kind}:${i}`, t, SIZE)!;

describe('swimming', () => {
  it('is a pure function of (seed, id, t)', () => {
    for (const kind of Object.keys(SWIMMERS)) expect(pose(kind, 3, 12.5)).toEqual(pose(kind, 3, 12.5));
    expect(pose('recipe:shark', 1, 5)).not.toEqual(pose('recipe:shark', 2, 5));
  });

  it('keeps moving: no swimmer ever stands still (except none) and the path is continuous', () => {
    for (const kind of Object.keys(SWIMMERS)) {
      for (let t = 0; t < 120; t += 0.7) {
        const a = pose(kind, 0, t);
        const b = pose(kind, 0, t + 0.1);
        const v = Math.hypot(b.x - a.x, b.z - a.z) / 0.1;
        expect(v, `${kind} @${t}`).toBeGreaterThan(SWIMMERS[kind]!.speed * 0.15);
        expect(v, `${kind} @${t}`).toBeLessThan(SWIMMERS[kind]!.speed * 2);
      }
    }
  });

  it('points the nose where it goes (crabs go sideways)', () => {
    for (const kind of Object.keys(SWIMMERS)) {
      const spec = SWIMMERS[kind]!;
      if (spec.wiggle) continue;
      for (const t of [1, 9, 33, 80]) {
        const a = pose(kind, 2, t);
        const b = pose(kind, 2, t + 0.01);
        const heading = Math.atan2(b.z - a.z, b.x - a.x) + (spec.sideways ? Math.PI / 2 : 0);
        const diff = Math.atan2(Math.sin(a.yaw - heading), Math.cos(a.yaw - heading));
        expect(Math.abs(diff), `${kind} @${t}`).toBeLessThan(0.05);
      }
    }
  });

  it('stays in its own depths, above the seabed, with a nose that follows the climb', () => {
    for (const kind of Object.keys(SWIMMERS)) {
      const [lo, hi] = SWIMMERS[kind]!.depth;
      for (let t = 0; t < 200; t += 1.3) {
        const p = pose(kind, 4, t);
        expect(p.y).toBeGreaterThanOrEqual(lo * SIZE - 1e-9);
        expect(p.y).toBeLessThanOrEqual(hi * SIZE + 1e-9);
      }
    }
    const climbing = [...Array(200).keys()].map((t) => pose('recipe:dolphin', 0, t * 0.2)).filter((p, i, all) => i > 0 && p.y > all[i - 1]!.y);
    expect(climbing.every((p) => (p.pitch ?? 0) >= -1e-9)).toBe(true);
    expect(pose('recipe:seahorse', 0, 10).pitch).toBe(0); // upright animals stay level
  });

  it('banks into its turns and reaches wide areas', () => {
    const rolls = [0, 1, 2, 3, 4, 5].flatMap((i) => [...Array(300).keys()].map((t) => pose('recipe:shark', i, t * 0.5).roll ?? 0));
    expect(Math.max(...rolls)).toBeGreaterThan(0);
    expect(Math.min(...rolls)).toBeLessThan(0);
    const xs = [...Array(400).keys()].map((t) => pose('recipe:whale', 0, t).x);
    expect(Math.max(...xs) - Math.min(...xs)).toBeGreaterThan(SIZE * 0.4);
  });

  it('is reachable through objectPoseAt, and sessions only swim underwater', () => {
    expect(objectPoseAt('recipe:whale', 1, 0, 3, SIZE)).not.toBeNull();
    expect(objectPoseAt('recipe:starfish', 1, 0, 3, SIZE)).toBeNull();
    const records = [{ index: 0, kind: 'recipe:whale' }, { index: 1, kind: 'recipe:starfish' }] as never;
    const sea = { records, template: { fx: { environment: 'underwater' } } } as never;
    const land = { records, template: { fx: { environment: 'land' } } } as never;
    expect(crowdItemsOf(sea, () => 1).map((i) => i.index)).toEqual([0]);
    expect(crowdItemsOf(land, () => 1)).toEqual([]);
  });
});
