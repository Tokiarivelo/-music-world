/** Pure geometry of the plan (top-down) view of a map: ground metres <-> canvas pixels, handles and hit tests. */

export interface PlanView {
  /** Canvas side in pixels (square). */
  readonly size: number;
  /** Half the width of the visible ground, in metres (the world is `-half..half` on both axes). */
  readonly half: number;
}

export interface Pt {
  readonly x: number;
  readonly y: number;
}

export function toScreen(view: PlanView, x: number, z: number): Pt {
  const k = view.size / (2 * view.half);
  return { x: (x + view.half) * k, y: (z + view.half) * k };
}

export function toWorld(view: PlanView, px: number, py: number): { x: number; z: number } {
  const k = (2 * view.half) / view.size;
  return { x: px * k - view.half, z: py * k - view.half };
}

/** Radius in pixels of an object of this scale (a dot that grows with it). */
export function dotRadius(scale: number): number {
  return 5 + 4 * Math.min(5, Math.max(0.2, scale));
}

const ROTATE_GAP_PX = 16;
const SCALE_ANGLE = Math.PI / 4;

/** Rotation handle: in the direction the object faces (yaw 0 faces up the screen, positive turns clockwise). */
export function rotateHandle(center: Pt, scale: number, yawDeg: number): Pt {
  const r = dotRadius(scale) + ROTATE_GAP_PX;
  const a = (yawDeg * Math.PI) / 180;
  return { x: center.x + Math.sin(a) * r, y: center.y - Math.cos(a) * r };
}

/** Scale handle: on the lower right of the dot. */
export function scaleHandle(center: Pt, scale: number): Pt {
  const r = dotRadius(scale);
  return { x: center.x + Math.cos(SCALE_ANGLE) * r, y: center.y + Math.sin(SCALE_ANGLE) * r };
}

export function yawFromPointer(center: Pt, p: Pt): number {
  return (Math.atan2(p.x - center.x, -(p.y - center.y)) * 180) / Math.PI;
}

/** Scale that makes the dot reach the pointer along the scale handle's direction. */
export function scaleFromPointer(center: Pt, p: Pt): number {
  const d = Math.hypot(p.x - center.x, p.y - center.y);
  return Math.min(5, Math.max(0.2, (d - 5) / 4));
}

export type Hit = { type: 'object'; id: string } | { type: 'rotate'; id: string } | { type: 'scale'; id: string } | { type: 'ground' };

export interface Target {
  readonly id: string;
  readonly x: number;
  readonly z: number;
  readonly scale: number;
  readonly yaw: number;
}

const HANDLE_HIT_PX = 8;

/** What is under the pixel: the handles of the selected object first, then the nearest object, else the ground. */
export function hitTest(view: PlanView, objects: readonly Target[], selectedId: string | null, p: Pt): Hit {
  const selected = objects.find((o) => o.id === selectedId);
  if (selected) {
    const c = toScreen(view, selected.x, selected.z);
    if (Math.hypot(p.x - rotateHandle(c, selected.scale, selected.yaw).x, p.y - rotateHandle(c, selected.scale, selected.yaw).y) <= HANDLE_HIT_PX) return { type: 'rotate', id: selected.id };
    const sh = scaleHandle(c, selected.scale);
    if (Math.hypot(p.x - sh.x, p.y - sh.y) <= HANDLE_HIT_PX) return { type: 'scale', id: selected.id };
  }
  let best: { id: string; d: number } | null = null;
  for (const o of objects) {
    const c = toScreen(view, o.x, o.z);
    const d = Math.hypot(p.x - c.x, p.y - c.y);
    if (d <= dotRadius(o.scale) + 2 && (best === null || d < best.d)) best = { id: o.id, d };
  }
  return best ? { type: 'object', id: best.id } : { type: 'ground' };
}
