/**
 * Note picking (improvement I9, requirement 12): a CPU lookup over the notes of the current frame, not a scene
 * raycast. Pure: the caller supplies a projection (camera → screen) or a ray, so it works for mouse, touch and VR.
 */
import { isRecordShown, type HiddenLayers } from '@/engine/layers';
import type { SpawnPlan } from '@/engine/spawn-plan';
import type { Vec3 } from '@/engine/types';
import type { WorldState } from '@/engine/world-state';

export const PICK_RADIUS_PX = 24;
export const PICK_RADIUS_RAD = 0.04;

export interface Pickable {
  readonly index: number;
  readonly position: Vec3;
}

/** Notes that can be picked now: on the staff and in their fall; hidden layers excluded. */
export function pickables(state: WorldState, plan: SpawnPlan, hidden: HiddenLayers): Pickable[] {
  const out: Pickable[] = [];
  for (const n of state.notesOnStaff) if (isRecordShown(plan, n.index, hidden)) out.push(n);
  for (const n of state.fallingNotes) if (isRecordShown(plan, n.index, hidden)) out.push(n);
  return out;
}

export interface ScreenPoint {
  readonly x: number;
  readonly y: number;
}

/** Projects a world point to screen pixels; null when it is behind the camera. */
export type Projector = (p: Vec3) => ScreenPoint | null;

/** Nearest note within `radiusPx` of the pointer, or null. Ties go to the lower index (earlier note). */
export function pickAtScreen(
  items: readonly Pickable[],
  project: Projector,
  pointer: ScreenPoint,
  radiusPx = PICK_RADIUS_PX,
): number | null {
  let best: number | null = null;
  let bestD = radiusPx * radiusPx;
  for (const it of items) {
    const s = project(it.position);
    if (!s) continue;
    const d = (s.x - pointer.x) ** 2 + (s.y - pointer.y) ** 2;
    if (d < bestD || (d === bestD && best !== null && it.index < best)) {
      bestD = d;
      best = it.index;
    }
  }
  return best;
}

/** Nearest note to a ray (VR controller or pinch) within an angular radius, or null. `dir` must be normalized. */
export function pickAtRay(
  items: readonly Pickable[],
  origin: Vec3,
  dir: Vec3,
  radiusRad = PICK_RADIUS_RAD,
): number | null {
  let best: number | null = null;
  let bestAngle = radiusRad;
  for (const it of items) {
    const vx = it.position.x - origin.x;
    const vy = it.position.y - origin.y;
    const vz = it.position.z - origin.z;
    const len = Math.hypot(vx, vy, vz);
    if (len < 1e-6) continue;
    const cos = (vx * dir.x + vy * dir.y + vz * dir.z) / len;
    if (cos <= 0) continue;
    const angle = Math.acos(Math.min(1, cos));
    if (angle < bestAngle) {
      bestAngle = angle;
      best = it.index;
    }
  }
  return best;
}
