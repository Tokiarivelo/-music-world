import * as fc from 'fast-check';
import { describe, expect, it } from 'vitest';
import { driftAt, flightAt, loopAt, MOVING_KINDS, objectPoseAt, wrap, type Bounds, type FlightLane, type LoopPath } from './motion';

const area: Bounds = { halfWidth: 20, halfDepth: 15 };
const ring: LoopPath = { cx: 1, cz: -2, rx: 8, rz: 5, y: 0.1 };
const lane: FlightLane = { halfLength: 30, altitude: [10, 18], halfWidth: 12 };
const times = fc.double({ min: 0, max: 3600, noNaN: true });
const ids = fc.string({ minLength: 1, maxLength: 12 });

describe('object motion (I8 task 4)', () => {
  it('wraps into [0, period)', () => {
    expect(wrap(-1, 4)).toBe(3);
    expect(wrap(9, 4)).toBe(1);
    expect(wrap(4, 4)).toBe(0);
  });

  it('is a pure function of (seed, id, t): the same inputs give the same pose, whatever was asked before', () => {
    fc.assert(
      fc.property(fc.integer(), ids, times, times, (seed, id, t1, t2) => {
        const first = driftAt(seed, id, t2, area, [30, 40]);
        driftAt(seed, id, t1, area, [30, 40]); // a "seek" elsewhere in between changes nothing
        expect(driftAt(seed, id, t2, area, [30, 40])).toEqual(first);
        expect(loopAt(seed, id, t2, ring)).toEqual(loopAt(seed, id, t2, ring));
        expect(flightAt(seed, id, t2, lane)).toEqual(flightAt(seed, id, t2, lane));
      }),
    );
  });

  it('clouds stay inside the area at their height', () => {
    fc.assert(
      fc.property(fc.integer(), ids, times, (seed, id, t) => {
        const p = driftAt(seed, id, t, area, [30, 40]);
        expect(Math.abs(p.x)).toBeLessThanOrEqual(area.halfWidth + 1e-9);
        expect(Math.abs(p.z)).toBeLessThanOrEqual(area.halfDepth + 1e-9);
        expect(p.y).toBeGreaterThan(29);
        expect(p.y).toBeLessThan(41);
      }),
    );
  });

  it('cars stay on the ring and face along it', () => {
    fc.assert(
      fc.property(fc.integer(), ids, times, (seed, id, t) => {
        const p = loopAt(seed, id, t, ring);
        const onRing = ((p.x - ring.cx) / ring.rx) ** 2 + ((p.z - ring.cz) / ring.rz) ** 2;
        // Each direction keeps to its own lane: the radius is within 10 % of the ring's.
        expect(Math.sqrt(onRing)).toBeGreaterThan(0.89);
        expect(Math.sqrt(onRing)).toBeLessThan(1.11);
        expect(p.y).toBe(ring.y);
        const later = loopAt(seed, id, t + 0.01, ring);
        const heading = Math.atan2(later.z - p.z, later.x - p.x);
        expect(Math.cos(heading - p.yaw)).toBeGreaterThan(0.99);
      }),
    );
  });

  it('opposite directions drive in different lanes, so head-on cars never share a line', () => {
    const radiusOf = (id: string): { r: number; dir: number } => {
      const p = loopAt(5, id, 0, ring);
      const q = loopAt(5, id, 0.01, ring);
      const cross = (p.x - ring.cx) * (q.z - p.z) - (p.z - ring.cz) * (q.x - p.x);
      return { r: Math.sqrt(((p.x - ring.cx) / ring.rx) ** 2 + ((p.z - ring.cz) / ring.rz) ** 2), dir: Math.sign(cross) };
    };
    const cars = Array.from({ length: 40 }, (_, i) => radiusOf(`car:${i}`));
    const outer = cars.filter((c) => c.dir > 0).map((c) => c.r);
    const inner = cars.filter((c) => c.dir < 0).map((c) => c.r);
    expect(Math.min(...outer)).toBeGreaterThan(Math.max(...inner));
  });

  it('planes cross at constant speed inside the lane and restart at the edge', () => {
    fc.assert(
      fc.property(fc.integer(), ids, fc.double({ min: 0, max: 1000, noNaN: true }), (seed, id, t) => {
        const p = flightAt(seed, id, t, lane);
        expect(Math.abs(p.x)).toBeLessThanOrEqual(lane.halfLength + 1e-9);
        expect(Math.abs(p.z)).toBeLessThanOrEqual(lane.halfWidth);
        expect(p.y).toBeGreaterThanOrEqual(lane.altitude[0]);
        expect(p.y).toBeLessThanOrEqual(lane.altitude[1]);
        const a = flightAt(seed, id, t, lane);
        const b = flightAt(seed, id, t + 0.1, lane);
        if (Math.abs(b.x - a.x) < lane.halfLength) {
          const speed = Math.abs(b.x - a.x) / 0.1;
          expect(speed).toBeGreaterThanOrEqual(2.2 - 1e-6);
          expect(speed).toBeLessThanOrEqual(4.5 + 1e-6);
        }
      }),
    );
  });

  it('different objects do not move in lockstep', () => {
    const a = driftAt(1, 'cloud-1', 10, area, [30, 40]);
    const b = driftAt(1, 'cloud-2', 10, area, [30, 40]);
    expect(a).not.toEqual(b);
  });
});

describe('objectPoseAt (I8)', () => {
  const size = 14;

  it('only moving kinds have a pose', () => {
    for (const kind of ['building', 'tree', 'crystal', 'recipe:tower']) expect(objectPoseAt(kind, 7, 0, 5, size)).toBeNull();
    for (const kind of MOVING_KINDS) expect(objectPoseAt(kind, 7, 0, 5, size)).not.toBeNull();
  });

  it('is the same wherever the clock was before (seek equals play) and differs between instances', () => {
    for (const kind of MOVING_KINDS) {
      const direct = objectPoseAt(kind, 7, 3, 42.5, size);
      objectPoseAt(kind, 7, 3, 1, size);
      objectPoseAt(kind, 7, 3, 300, size);
      expect(objectPoseAt(kind, 7, 3, 42.5, size)).toEqual(direct);
      expect(objectPoseAt(kind, 7, 4, 42.5, size)).not.toEqual(direct);
    }
  });

  it('keeps clouds and planes in the sky and cars and bicycles on the ground inside the plate', () => {
    for (let i = 0; i < 20; i++) {
      for (const t of [0, 10, 123.4]) {
        for (const kind of ['cloud', 'airplane']) expect(objectPoseAt(kind, 1, i, t, size)!.y).toBeGreaterThan(1.5);
        for (const kind of ['car', 'bicycle']) {
          const p = objectPoseAt(kind, 1, i, t, size)!;
          expect(p.y).toBe(0);
          expect(Math.abs(p.x)).toBeLessThanOrEqual(size / 2);
          expect(Math.abs(p.z)).toBeLessThanOrEqual(size / 2);
        }
      }
    }
  });
});
