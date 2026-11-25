/**
 * Ocean currents (I37): how a note travels from the staff to its landing point when the template says
 * `staff.style: "current"`. Pure: the path depends only on `(from, to, noteHash, progress)`, so a seek gives the same
 * picture as playing, and the note lands exactly on its target (the meander is zero at both ends).
 *
 * The flow is shared: the lateral push is a function of the position along the path, not of the note, so notes that
 * fall together are swept the same way and visibly ride the same stream. Only a small per-note jitter differs.
 */
import { CURRENT_JITTER, CURRENT_MEANDER_RATIO } from './constants';
import type { Vec3 } from './types';

const clamp01 = (v: number): number => Math.min(1, Math.max(0, v));
const smooth = (p: number): number => p * p * (3 - 2 * p);

/** Lateral displacement of the stream at `progress` ∈ [0, 1] (plate metres, zero at both ends). */
export function currentMeander(noteHash: number, progress: number, plateSize: number): { dx: number; dz: number } {
  const p = clamp01(progress);
  const envelope = Math.sin(Math.PI * p);
  const jitter = 1 + CURRENT_JITTER * ((((noteHash >>> 8) & 0xff) / 255) * 2 - 1);
  const amplitude = plateSize * CURRENT_MEANDER_RATIO * jitter;
  const phase = (((noteHash >>> 0) & 0xff) / 255 - 0.5) * 0.6; // small shift: neighbours stay in step
  return {
    dx: amplitude * envelope * Math.sin(Math.PI * 2 * p + phase),
    dz: amplitude * 0.6 * envelope * Math.cos(Math.PI * 1.5 * p + phase),
  };
}

/** A note adrift: sinks slowly (eased, no acceleration), swept sideways by the stream, with a gentle bob. */
export function currentPosition(from: Vec3, to: Vec3, noteHash: number, progress: number, plateSize: number): Vec3 {
  const p = clamp01(progress);
  const flow = smooth(p);
  const meander = currentMeander(noteHash, p, plateSize);
  const bob = Math.sin(Math.PI * p) * Math.sin(Math.PI * 4 * p) * plateSize * 0.004;
  return {
    x: from.x + (to.x - from.x) * flow + meander.dx,
    y: from.y + (to.y - from.y) * flow + bob,
    z: from.z + (to.z - from.z) * flow + meander.dz,
  };
}
