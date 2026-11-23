import fc from 'fast-check';
import { Quaternion, Vector3 } from 'three';
import { describe, expect, it } from 'vitest';
import { VR_DIORAMA_DISTANCE_M, VR_TABLE_HEIGHT_M } from './constants';
import { tabletopPose, yawFromQuaternion } from './xr-placement';

function quat(yaw: number, pitch: number, roll: number) {
  // Head orientation: yaw around y, then pitch around x, then roll around z (intrinsic YXZ, like a head).
  return new Quaternion()
    .setFromAxisAngle(new Vector3(0, 1, 0), yaw)
    .multiply(new Quaternion().setFromAxisAngle(new Vector3(1, 0, 0), pitch))
    .multiply(new Quaternion().setFromAxisAngle(new Vector3(0, 0, 1), roll));
}

const angle = (a: number, b: number) => Math.abs(Math.atan2(Math.sin(a - b), Math.cos(a - b)));

describe('yawFromQuaternion', () => {
  it('is 0 for the identity (looking along −z)', () => {
    expect(yawFromQuaternion({ x: 0, y: 0, z: 0, w: 1 })).toBeCloseTo(0, 12);
  });

  it('recovers the yaw whatever the pitch and roll (property)', () => {
    fc.assert(
      fc.property(
        fc.double({ min: -Math.PI, max: Math.PI, noNaN: true }),
        fc.double({ min: -1.4, max: 1.4, noNaN: true }),
        fc.double({ min: -1, max: 1, noNaN: true }),
        (yaw, pitch, roll) => {
          expect(angle(yawFromQuaternion(quat(yaw, pitch, roll)), yaw)).toBeLessThan(1e-6);
        },
      ),
    );
  });
});

describe('tabletopPose', () => {
  it('puts the plate in front of a head looking along −z, at table height', () => {
    const pose = tabletopPose({ x: 0.2, y: 1.6, z: 0.5 }, 0);
    expect(pose.position.x).toBeCloseTo(0.2, 12);
    expect(pose.position.y).toBe(VR_TABLE_HEIGHT_M);
    expect(pose.position.z).toBeCloseTo(0.5 - VR_DIORAMA_DISTANCE_M, 12);
    expect(pose.yaw).toBe(0);
  });

  it('keeps the plate at the configured floor distance along the head forward, front edge toward the head', () => {
    fc.assert(
      fc.property(
        fc.double({ min: -5, max: 5, noNaN: true }),
        fc.double({ min: 0.5, max: 2.2, noNaN: true }),
        fc.double({ min: -5, max: 5, noNaN: true }),
        fc.double({ min: -Math.PI, max: Math.PI, noNaN: true }),
        (x, y, z, yaw) => {
          const { position, yaw: plateYaw } = tabletopPose({ x, y, z }, yaw);
          expect(Math.hypot(position.x - x, position.z - z)).toBeCloseTo(VR_DIORAMA_DISTANCE_M, 9);
          expect(position.y).toBe(VR_TABLE_HEIGHT_M);
          // The plate's front direction (+z rotated by yaw) points from the plate back to the head.
          const fx = Math.sin(plateYaw);
          const fz = Math.cos(plateYaw);
          const toHead = { x: (x - position.x) / VR_DIORAMA_DISTANCE_M, z: (z - position.z) / VR_DIORAMA_DISTANCE_M };
          expect(fx * toHead.x + fz * toHead.z).toBeCloseTo(1, 9);
        },
      ),
    );
  });
});
