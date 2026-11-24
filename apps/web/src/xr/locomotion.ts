/**
 * VR locomotion in the immersive scale (I7 requirements 2 and 6), pure. The viewer never moves in the tracked space:
 * the plate (the anchor) moves and turns around the head, which is the same thing and keeps the floor under the feet.
 * Glide is slow (≤ 2 m/s), turning is a snap, so nothing moves the camera without a deliberate input.
 */
import { VR_GLIDE_SPEED_MPS, VR_SNAP_TURN_RAD, VR_STICK_DEADZONE, WALK_MARGIN_M } from './constants';

export interface Stick {
  x: number;
  y: number;
}

/** Horizontal glide of the viewer in world metres for one frame (`headYaw`: 0 looks toward −z). */
export function glide(stick: Stick, headYaw: number, dtSec: number, reduced = false): { dx: number; dz: number } {
  if (reduced) return { dx: 0, dz: 0 };
  const sx = Math.abs(stick.x) < VR_STICK_DEADZONE ? 0 : stick.x;
  const sy = Math.abs(stick.y) < VR_STICK_DEADZONE ? 0 : stick.y;
  const length = Math.hypot(sx, sy);
  if (length === 0 || !(dtSec > 0)) return { dx: 0, dz: 0 };
  const k = Math.min(1, length) / length;
  const right = sx * k;
  const forward = -sy * k; // pushing the stick forward gives y < 0
  const step = VR_GLIDE_SPEED_MPS * Math.min(dtSec, 0.1);
  const sin = Math.sin(headYaw);
  const cos = Math.cos(headYaw);
  return { dx: (right * cos - forward * sin) * step, dz: (-right * sin - forward * cos) * step };
}

/** Snap turn direction on the frame the stick leaves the dead zone sideways (−1 left, +1 right, 0 none). */
export class SnapTurn {
  private latched = false;

  update(x: number): -1 | 0 | 1 {
    if (Math.abs(x) < 0.6) {
      this.latched = false;
      return 0;
    }
    if (this.latched) return 0;
    this.latched = true;
    return x > 0 ? 1 : -1;
  }
}

export interface Pose2 {
  x: number;
  z: number;
  yaw: number;
}

/** Turns the anchor around the head position by `angle` (positive = the world turns left, the viewer turns right). */
export function turnAround(anchor: Pose2, head: { x: number; z: number }, angle: number): Pose2 {
  const sin = Math.sin(angle);
  const cos = Math.cos(angle);
  const ox = anchor.x - head.x;
  const oz = anchor.z - head.z;
  return { x: head.x + ox * cos + oz * sin, z: head.z - ox * sin + oz * cos, yaw: anchor.yaw + angle };
}

/** The viewer's position in plate coordinates (metres from the plate centre, along the plate's axes). */
export function plateOffset(anchor: Pose2, head: { x: number; z: number }): { x: number; z: number } {
  const ox = head.x - anchor.x;
  const oz = head.z - anchor.z;
  const sin = Math.sin(anchor.yaw);
  const cos = Math.cos(anchor.yaw);
  return { x: ox * cos - oz * sin, z: ox * sin + oz * cos };
}

/** True while the viewer stands on the plate or within the walking margin around it. */
export function onPlate(anchor: Pose2, head: { x: number; z: number }, halfWidth: number): boolean {
  const o = plateOffset(anchor, head);
  const limit = halfWidth + WALK_MARGIN_M;
  return Math.abs(o.x) <= limit && Math.abs(o.z) <= limit;
}

export const SNAP_TURN_RAD = VR_SNAP_TURN_RAD;
