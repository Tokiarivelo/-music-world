/**
 * First-person walk on the plate (I7 requirement 3). Pure and framework-free: positions are in world metres on the
 * ground plane, yaw 0 looks toward −z (like the orbit camera), the eye is at `EYE_HEIGHT_M`. The plate is scaled by
 * `rootScale` and centred on `anchor`; the walker may go `WALK_MARGIN_M` past its edge, where the environment ground
 * continues, so the world is not a closed square.
 */
import type { SpawnPlan } from '@/engine/spawn-plan';
import {
  EYE_HEIGHT_M,
  KIND_FOOTPRINT,
  NAV_MAX_STEP_SEC,
  RECIPE_FOOTPRINT,
  WALK_FAST_FACTOR,
  WALK_LOOK_RAD_PER_PX,
  WALK_MARGIN_M,
  WALK_PITCH_LIMIT_RAD,
  WALK_SPEED_MPS,
} from '../constants';
import type { FlyKeys } from './orbit-camera';

export interface WalkPose {
  readonly x: number;
  readonly z: number;
  /** Radians; 0 looks toward −z, positive turns toward −x (same sign as the orbit camera). */
  readonly yaw: number;
  /** Radians above the horizon, within ±`WALK_PITCH_LIMIT_RAD`. */
  readonly pitch: number;
}

export interface Circle {
  x: number;
  z: number;
  r: number;
}

export interface WalkBounds {
  /** Plate centre and half width in world metres. */
  cx: number;
  cz: number;
  half: number;
  /** Dome world: the walker stays inside a circle (`DOME_WALK_RATIO` of the half width) and starts at the centre. */
  dome?: boolean;
}

/** Share of the half width the walker may reach inside the dome. */
export const DOME_WALK_RATIO = 0.85;

/** Radius of the walker's body (m). */
export const WALKER_RADIUS_M = 0.4;

export function startPose(bounds: WalkBounds, startZ = bounds.dome ? bounds.cz : bounds.cz + 30): WalkPose {
  return { x: bounds.cx, z: startZ, yaw: 0, pitch: 0 };
}

function clamp(v: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, v));
}

/** Keeps the walker on the plate plus the margin. Non-finite values fall back to the plate centre. */
export function clampToBounds(x: number, z: number, b: WalkBounds): { x: number; z: number } {
  if (b.dome) {
    const px = Number.isFinite(x) ? x - b.cx : 0;
    const pz = Number.isFinite(z) ? z - b.cz : 0;
    const max = b.half * DOME_WALK_RATIO;
    const d = Math.hypot(px, pz);
    return d <= max ? { x: b.cx + px, z: b.cz + pz } : { x: b.cx + (px / d) * max, z: b.cz + (pz / d) * max };
  }
  const limit = b.half + WALK_MARGIN_M;
  const cx = Number.isFinite(x) ? x : b.cx;
  const cz = Number.isFinite(z) ? z : b.cz;
  return { x: clamp(cx, b.cx - limit, b.cx + limit), z: clamp(cz, b.cz - limit, b.cz + limit) };
}

/** Pushes a point out of every circle it overlaps (a few passes settle corners between neighbours). */
export function pushOut(x: number, z: number, radius: number, circles: readonly Circle[]): { x: number; z: number } {
  let px = x;
  let pz = z;
  for (let pass = 0; pass < 3; pass += 1) {
    let moved = false;
    for (const c of circles) {
      const dx = px - c.x;
      const dz = pz - c.z;
      const min = c.r + radius;
      const d2 = dx * dx + dz * dz;
      if (d2 >= min * min) continue;
      const d = Math.sqrt(d2);
      const nx = d > 1e-6 ? dx / d : 1;
      const nz = d > 1e-6 ? dz / d : 0;
      px = c.x + nx * min;
      pz = c.z + nz * min;
      moved = true;
    }
    if (!moved) break;
  }
  return { x: px, z: pz };
}

/** Mouse / touch look: `dx`, `dy` in pixels (a drag to the right turns the view to the right). */
export function look(pose: WalkPose, dxPx: number, dyPx: number): WalkPose {
  return {
    ...pose,
    yaw: pose.yaw - dxPx * WALK_LOOK_RAD_PER_PX,
    pitch: clamp(pose.pitch - dyPx * WALK_LOOK_RAD_PER_PX, -WALK_PITCH_LIMIT_RAD, WALK_PITCH_LIMIT_RAD),
  };
}

/** One frame of keyboard walking: move relative to the view, turn with Q / E, then bounds and collisions. */
export function walk(
  pose: WalkPose,
  keys: FlyKeys,
  dtSec: number,
  bounds: WalkBounds,
  obstacles: readonly Circle[],
  turnRate = 1.4,
): WalkPose {
  const dt = clamp(Number.isFinite(dtSec) ? dtSec : 0, 0, NAV_MAX_STEP_SEC);
  if (dt === 0 || (keys.forward === 0 && keys.right === 0 && keys.turn === 0)) return pose;
  const yaw = pose.yaw + keys.turn * turnRate * dt;
  const speed = WALK_SPEED_MPS * (keys.fast ? WALK_FAST_FACTOR : 1) * dt;
  const sin = Math.sin(yaw);
  const cos = Math.cos(yaw);
  const x = pose.x + keys.right * speed * cos - keys.forward * speed * sin;
  const z = pose.z - keys.right * speed * sin - keys.forward * speed * cos;
  const free = pushOut(x, z, WALKER_RADIUS_M, obstacles);
  const inside = clampToBounds(free.x, free.z, bounds);
  return { x: inside.x, z: inside.z, yaw, pitch: pose.pitch };
}

/** Camera position and the point it looks at, for `camera.position` and `camera.lookAt`. */
export function walkCamera(pose: WalkPose): { eye: { x: number; y: number; z: number }; at: { x: number; y: number; z: number } } {
  const cosP = Math.cos(pose.pitch);
  return {
    eye: { x: pose.x, y: EYE_HEIGHT_M, z: pose.z },
    at: {
      x: pose.x - Math.sin(pose.yaw) * cosP,
      y: EYE_HEIGHT_M + Math.sin(pose.pitch),
      z: pose.z - Math.cos(pose.yaw) * cosP,
    },
  };
}

/**
 * Collision circles of the structures that have landed by `t`, in world metres. `scale` is the root scale and
 * `anchor` the plate centre. A shape's footprint is its half width in plate units, as the instance is scaled by it.
 */
export function obstaclesAt(plan: SpawnPlan, t: number, scale: number, anchor: { x: number; z: number }): Circle[] {
  const recipeFootprint = new Map(plan.template.recipes.map((r) => [`recipe:${r.name}`, r.footprint]));
  const out: Circle[] = [];
  for (const record of plan.records) {
    if (record.landAt > t) continue;
    const footprint = KIND_FOOTPRINT[record.kind] ?? recipeFootprint.get(record.kind) ?? RECIPE_FOOTPRINT;
    out.push({ x: anchor.x + record.target.x * scale, z: anchor.z + record.target.z * scale, r: (footprint / 2) * scale });
  }
  return out;
}
