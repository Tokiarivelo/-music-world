/**
 * Tabletop placement of the diorama in VR (07-xr-mode requirement 2). Pure: unit-tested without IWSDK.
 *
 * Convention (three.js): the user looks along −z when yaw = 0; a rotation of `yaw` around +y maps the forward vector
 * (0, 0, −1) to (−sin yaw, 0, −cos yaw). The plate's +z edge is its front edge (closest to the user).
 */
import { VR_DIORAMA_DISTANCE_M, VR_TABLE_HEIGHT_M } from './constants';

export interface Vec3 {
  x: number;
  y: number;
  z: number;
}

export interface Quat {
  x: number;
  y: number;
  z: number;
  w: number;
}

export interface TabletopPose {
  position: Vec3;
  /** Rotation of the diorama anchor around +y (radians). */
  yaw: number;
}

/** Heading of the head's forward vector projected on the floor: pitch and roll are ignored. */
export function yawFromQuaternion(q: Quat): number {
  // f = q · (0, 0, −1)
  const fx = -2 * (q.x * q.z + q.w * q.y);
  const fz = -(1 - 2 * (q.x * q.x + q.y * q.y));
  if (Math.abs(fx) < 1e-9 && Math.abs(fz) < 1e-9) return 0; // looking straight up or down: keep facing −z
  return Math.atan2(-fx, -fz);
}

/** The plate centre in front of the head at table height, its front edge facing the user. */
export function tabletopPose(head: Vec3, yaw: number, distance = VR_DIORAMA_DISTANCE_M): TabletopPose {
  return {
    position: {
      x: head.x - Math.sin(yaw) * distance,
      y: VR_TABLE_HEIGHT_M,
      z: head.z - Math.cos(yaw) * distance,
    },
    yaw,
  };
}
