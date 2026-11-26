import { describe, expect, it } from 'vitest';
import { currentPosition } from './current';

const from = { x: 4, y: 3, z: -2 };
const to = { x: -1, y: 0.2, z: 3 };

describe('currentPosition (ocean currents)', () => {
  it('starts on the staff and lands exactly on the target', () => {
    expect(currentPosition(from, to, 123, 0, 12)).toEqual(from);
    const end = currentPosition(from, to, 123, 1, 12);
    expect(end.x).toBeCloseTo(to.x, 9);
    expect(end.y).toBeCloseTo(to.y, 9);
    expect(end.z).toBeCloseTo(to.z, 9);
  });

  it('is pure and sinks without accelerating', () => {
    expect(currentPosition(from, to, 7, 0.4, 12)).toEqual(currentPosition(from, to, 7, 0.4, 12));
    const mid = currentPosition(from, to, 7, 0.5, 12);
    expect(mid.y).toBeLessThan(from.y);
    expect(mid.y).toBeGreaterThan(to.y - 0.1);
  });

  it('sweeps neighbouring notes the same way (shared stream)', () => {
    const a = currentPosition(from, to, 0x00010203, 0.3, 12);
    const b = currentPosition(from, to, 0x00010204, 0.3, 12);
    expect(Math.hypot(a.x - b.x, a.z - b.z)).toBeLessThan(0.3);
  });
});
