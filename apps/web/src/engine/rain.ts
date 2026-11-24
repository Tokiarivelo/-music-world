/**
 * Aurora rain (I6 requirement 2): how a note falls from the curtain in the sky to its landing point. Pure: the path
 * depends only on `(seed, noteId, progress)`, so a seek gives the same picture as playing (requirement 4) and the note
 * arrives exactly on its target (the sway is zero at both ends).
 */
import { AURORA_SWAY_RATIO } from './constants';
import type { Vec3 } from './types';

/** Horizontal sway at `progress` ∈ [0, 1] for a note whose hash is `noteHash` (plate metres, zero at both ends). */
export function rainSway(noteHash: number, progress: number, plateSize: number): { dx: number; dz: number } {
  const p = Math.min(1, Math.max(0, progress));
  const envelope = Math.sin(Math.PI * p);
  const amplitude = plateSize * AURORA_SWAY_RATIO * (0.4 + 0.6 * (((noteHash >>> 16) & 0xff) / 255));
  const phaseX = (((noteHash >>> 0) & 0xff) / 255) * Math.PI * 2;
  const phaseZ = (((noteHash >>> 8) & 0xff) / 255) * Math.PI * 2;
  return {
    dx: amplitude * envelope * Math.sin(Math.PI * 3 * p + phaseX),
    dz: amplitude * envelope * Math.sin(Math.PI * 2.3 * p + phaseZ),
  };
}

/** A drop of light: it accelerates as it falls (vertical eased, horizontal linear), with the sway on top. */
export function rainPosition(from: Vec3, to: Vec3, noteHash: number, progress: number, plateSize: number): Vec3 {
  const p = Math.min(1, Math.max(0, progress));
  const fall = p * p;
  const sway = rainSway(noteHash, p, plateSize);
  return {
    x: from.x + (to.x - from.x) * p + sway.dx,
    y: from.y + (to.y - from.y) * fall,
    z: from.z + (to.z - from.z) * p + sway.dz,
  };
}
