/** Pure software thumbnail: an isometric flat-shaded projection of triangle positions (spec 12, task 2.2). */

export interface ThumbFace {
  /** Flat x,y pairs of the three corners, in 0..1 of the thumbnail. */
  readonly points: readonly [number, number, number, number, number, number];
  /** 0..1 light amount. */
  readonly shade: number;
  readonly depth: number;
  /** Group the face belongs to (`''` for a plain thumbnail). */
  readonly id: string;
}

export interface ThumbView {
  /** Radians around the vertical axis. */
  readonly yaw: number;
  /** Radians above the horizon. */
  readonly pitch: number;
}

export const DEFAULT_VIEW: ThumbView = { yaw: Math.PI / 4, pitch: Math.atan(1 / Math.SQRT2) };
export const MAX_PITCH = Math.PI / 2 - 0.05;

export interface FaceGroup {
  readonly id: string;
  readonly positions: ArrayLike<number>;
}

const LIGHT: readonly [number, number, number] = normalize([0.4, 0.9, 0.5]);

function normalize(v: readonly number[]): [number, number, number] {
  const l = Math.hypot(v[0]!, v[1]!, v[2]!) || 1;
  return [v[0]! / l, v[1]! / l, v[2]! / l];
}

/**
 * Faces of a non-indexed triangle list (x,y,z per vertex), sorted far to near, fitted in the unit square with a margin.
 * Same input, same output.
 */
export function thumbnailFaces(positions: ArrayLike<number>, margin = 0.08, view: ThumbView = DEFAULT_VIEW): ThumbFace[] {
  return sceneFaces([{ id: '', positions }], view, margin);
}

/** Faces of several groups fitted together (an object of many parts), seen from `view`, far to near. */
export function sceneFaces(groups: readonly FaceGroup[], view: ThumbView = DEFAULT_VIEW, margin = 0.08): ThumbFace[] {
  const cy = Math.cos(view.yaw);
  const sy = Math.sin(view.yaw);
  const pitch = Math.min(MAX_PITCH, Math.max(-MAX_PITCH, view.pitch));
  const cp = Math.cos(pitch);
  const sp = Math.sin(pitch);
  const project = (x: number, y: number, z: number): [number, number, number] => {
    const rx = x * cy - z * sy;
    const rz = x * sy + z * cy;
    return [rx, y * cp - rz * sp, y * sp + rz * cp]; // screen x, screen y (up), depth (larger = nearer)
  };
  const raw: { p: number[]; shade: number; depth: number; id: string }[] = [];
  let minX = Infinity, maxX = -Infinity, minY = Infinity, maxY = -Infinity;
  for (const { id, positions } of groups) for (let i = 0, triangles = Math.floor(positions.length / 9); i < triangles; i += 1) {
    const o = i * 9;
    const a = [positions[o]!, positions[o + 1]!, positions[o + 2]!];
    const b = [positions[o + 3]!, positions[o + 4]!, positions[o + 5]!];
    const c = [positions[o + 6]!, positions[o + 7]!, positions[o + 8]!];
    const n = normalize([
      (b[1]! - a[1]!) * (c[2]! - a[2]!) - (b[2]! - a[2]!) * (c[1]! - a[1]!),
      (b[2]! - a[2]!) * (c[0]! - a[0]!) - (b[0]! - a[0]!) * (c[2]! - a[2]!),
      (b[0]! - a[0]!) * (c[1]! - a[1]!) - (b[1]! - a[1]!) * (c[0]! - a[0]!),
    ]);
    const shade = 0.35 + 0.65 * Math.abs(n[0] * LIGHT[0] + n[1] * LIGHT[1] + n[2] * LIGHT[2]);
    const pa = project(a[0]!, a[1]!, a[2]!);
    const pb = project(b[0]!, b[1]!, b[2]!);
    const pc = project(c[0]!, c[1]!, c[2]!);
    for (const q of [pa, pb, pc]) {
      minX = Math.min(minX, q[0]); maxX = Math.max(maxX, q[0]);
      minY = Math.min(minY, q[1]); maxY = Math.max(maxY, q[1]);
    }
    raw.push({ p: [pa[0], pa[1], pb[0], pb[1], pc[0], pc[1]], shade, depth: (pa[2] + pb[2] + pc[2]) / 3, id });
  }
  if (raw.length === 0) return [];
  const span = Math.max(maxX - minX, maxY - minY) || 1;
  const scale = (1 - 2 * margin) / span;
  const ox = margin + ((1 - 2 * margin) - (maxX - minX) * scale) / 2;
  const oy = margin + ((1 - 2 * margin) - (maxY - minY) * scale) / 2;
  return raw
    .sort((u, v) => u.depth - v.depth)
    .map((f) => {
      const p = f.p.map((value, k) => (k % 2 === 0 ? ox + (value - minX) * scale : oy + (maxY - value) * scale));
      return { points: p as unknown as ThumbFace['points'], shade: f.shade, depth: f.depth, id: f.id };
    });
}
