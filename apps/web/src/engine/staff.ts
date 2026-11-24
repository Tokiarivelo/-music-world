/**
 * Staff geometry (requirement 3.1): a quadratic Bézier centre line across the plate, five lines stacked above it.
 * Pure math in plate metres, shared by the engine (note positions) and the renderer (line tubes).
 */
import { AURORA_GAP_FACTOR, AURORA_HEIGHT_RATIO, STAFF_HEIGHT_RATIO, STAFF_LINE_GAP_RATIO, STAFF_PLAYHEAD_U } from './constants';
import type { Vec3, WorldTemplate } from './types';

export interface StaffPath {
  /** u = 0: playhead end (near-left); u = 1: far end (far-right) where notes appear. */
  readonly start: Vec3;
  readonly control: Vec3;
  readonly end: Vec3;
  /** Height of the bottom line above the plate and gap between lines, in metres. */
  readonly baseY: number;
  readonly lineGap: number;
  readonly playheadU: number;
}

/**
 * From the near edge (left of centre) to the far edge (right of centre), in normalized plate units: seen from the
 * isometric desktop camera it crosses the frame diagonally, rising to the right, with the city on its left, like the
 * reference image (04-default-template requirement 3.1). Bowed slightly toward the open (right) side.
 */
const DIAGONAL_START = { x: -0.5, z: 0.86 };
const DIAGONAL_END = { x: 0.42, z: -0.9 };
const CURVE_BOW = { x: 0.1, z: 0.04 };

export function buildStaffPath(template: WorldTemplate): StaffPath {
  const half = template.terrain.size / 2;
  const bow = template.staff.path === 'diagonal_curve' ? CURVE_BOW : { x: 0, z: 0 };
  const midX = (DIAGONAL_START.x + DIAGONAL_END.x) / 2;
  const midZ = (DIAGONAL_START.z + DIAGONAL_END.z) / 2;
  const aurora = template.staff.style === 'aurora';
  const baseY = template.terrain.size * (aurora ? AURORA_HEIGHT_RATIO : STAFF_HEIGHT_RATIO);
  return {
    start: { x: DIAGONAL_START.x * half, y: baseY, z: DIAGONAL_START.z * half },
    // A quadratic Bézier passes halfway to its control point, so double the bow.
    control: { x: (midX + 2 * bow.x) * half, y: baseY, z: (midZ + 2 * bow.z) * half },
    end: { x: DIAGONAL_END.x * half, y: baseY, z: DIAGONAL_END.z * half },
    baseY,
    lineGap: template.terrain.size * STAFF_LINE_GAP_RATIO * (aurora ? AURORA_GAP_FACTOR : 1),
    playheadU: STAFF_PLAYHEAD_U,
  };
}

/** Point of the bottom staff line at parameter u ∈ [0, 1]. */
export function staffPoint(path: StaffPath, u: number): Vec3 {
  const a = (1 - u) * (1 - u);
  const b = 2 * (1 - u) * u;
  const c = u * u;
  return {
    x: a * path.start.x + b * path.control.x + c * path.end.x,
    y: a * path.start.y + b * path.control.y + c * path.end.y,
    z: a * path.start.z + b * path.control.z + c * path.end.z,
  };
}

/** Note head position: `staffU` 0 = bottom line, 1 = top (fifth) line. */
export function staffNotePosition(path: StaffPath, u: number, staffU: number): Vec3 {
  const p = staffPoint(path, u);
  return { x: p.x, y: p.y + staffU * 4 * path.lineGap, z: p.z };
}
