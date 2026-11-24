import fc from 'fast-check';
import { describe, expect, it } from 'vitest';
import { VR_GLIDE_SPEED_MPS } from './constants';
import { SnapTurn, glide, onPlate, plateOffset, turnAround } from './locomotion';

describe('VR locomotion', () => {
  it('ignores the dead zone and caps the glide speed', () => {
    expect(glide({ x: 0.1, y: -0.1 }, 0, 0.016)).toEqual({ dx: 0, dz: 0 });
    fc.assert(
      fc.property(fc.double({ min: -1, max: 1, noNaN: true }), fc.double({ min: -1, max: 1, noNaN: true }), fc.double({ min: -6, max: 6, noNaN: true }), (x, y, yaw) => {
        const { dx, dz } = glide({ x, y }, yaw, 0.05);
        expect(Math.hypot(dx, dz)).toBeLessThanOrEqual(VR_GLIDE_SPEED_MPS * 0.05 + 1e-9);
      }),
    );
  });

  it('pushing forward goes where the head looks', () => {
    const forward = glide({ x: 0, y: -1 }, 0, 0.1);
    expect(forward.dz).toBeLessThan(0);
    expect(Math.abs(forward.dx)).toBeLessThan(1e-9);
    const left = glide({ x: 0, y: -1 }, Math.PI / 2, 0.1);
    expect(left.dx).toBeLessThan(0);
  });

  it('does not move on reduced motion', () => {
    expect(glide({ x: 0, y: -1 }, 0, 0.1, true)).toEqual({ dx: 0, dz: 0 });
  });

  it('snap turns once per push of the stick', () => {
    const turn = new SnapTurn();
    expect([turn.update(0.9), turn.update(0.95), turn.update(0.2), turn.update(-0.9)]).toEqual([1, 0, 0, -1]);
  });

  it('turning the plate around the head leaves the head where it is on the plate', () => {
    const anchor = { x: 0, z: -30, yaw: 0 };
    const head = { x: 0, z: 0 };
    const before = plateOffset(anchor, head);
    const turned = turnAround(anchor, head, Math.PI / 6);
    const after = plateOffset(turned, head);
    expect(Math.hypot(after.x, after.z)).toBeCloseTo(Math.hypot(before.x, before.z));
    expect(turned.yaw).toBeCloseTo(Math.PI / 6);
  });

  it('knows when the viewer is off the plate and its margin', () => {
    expect(onPlate({ x: 0, z: -30, yaw: 0 }, { x: 0, z: 0 }, 40)).toBe(true);
    expect(onPlate({ x: 0, z: 200, yaw: 0 }, { x: 0, z: 0 }, 40)).toBe(false);
  });
});
