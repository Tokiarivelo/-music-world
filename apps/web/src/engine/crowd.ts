/**
 * Crowd of moving objects (I31): cars, bicycles, planes and clouds that follow the music and never overlap.
 *
 * - **Rhythm and context.** Objects do not move on the wall-clock `t` but on a *musical clock* whose rate is low in a
 *   calm passage, higher in a loud one and surges on every beat (`musicClockOf`): a quiet verse crawls, a loud chorus
 *   rushes. The clock is a table integrated once per plan, so asking for any `t` stays O(log n) and a seek lands
 *   exactly where playing would have been.
 * - **No collision.** The base motions (`objectPoseAt`) are independent; the crowd then pushes every overlapping pair
 *   apart (position-based relaxation, deterministic). A car that catches up with another is pushed back (it backs off
 *   without turning round); one that meets it sideways is deflected. The heading follows the final velocity, and stays
 *   the base heading while the object backs up.
 *
 * Everything is a pure function of `(plan, t)`: no state, no physics stepping.
 */
import { hashSeed, mulberry32 } from './prng';
import { MOVING_KINDS, objectPoseAt, type Pose } from './motion';
import type { SpawnPlan } from './spawn-plan';

/** Rate of the musical clock: calm floor, extra rate at full energy, and the surge of a beat. */
export const CLOCK_BASE_RATE = 0.45;
export const CLOCK_ENERGY_GAIN = 1.1;
export const CLOCK_BEAT_GAIN = 0.7;
const BEAT_DECAY_SEC = 0.22;
const CLOCK_STEP_SEC = 0.05;

export interface MusicClock {
  /** Musical seconds elapsed at song time `t` (monotonic, 0 at 0). */
  at(t: number): number;
  /** Instantaneous rate at `t`. */
  rateAt(t: number): number;
}

function interpolate(times: readonly number[], values: readonly number[], t: number): number {
  const n = times.length;
  if (n === 0) return 0;
  if (t <= times[0]!) return values[0]!;
  if (t >= times[n - 1]!) return values[n - 1]!;
  let lo = 0;
  let hi = n - 1;
  while (hi - lo > 1) {
    const mid = (lo + hi) >> 1;
    if (times[mid]! <= t) lo = mid;
    else hi = mid;
  }
  const span = times[hi]! - times[lo]!;
  return span > 0 ? values[lo]! + ((values[hi]! - values[lo]!) * (t - times[lo]!)) / span : values[lo]!;
}

function beatPulse(beats: readonly number[], t: number): number {
  let lo = 0;
  let hi = beats.length;
  while (lo < hi) {
    const mid = (lo + hi) >> 1;
    if (beats[mid]! <= t) lo = mid + 1;
    else hi = mid;
  }
  return lo === 0 ? 0 : Math.exp(-(t - beats[lo - 1]!) / BEAT_DECAY_SEC);
}

export function buildMusicClock(
  beats: readonly number[],
  energy: { readonly times: readonly number[]; readonly values: readonly number[] },
  durationSec: number,
): MusicClock {
  const rateAt = (t: number): number => {
    const e = Math.min(1, Math.max(0, interpolate(energy.times, energy.values, t)));
    return CLOCK_BASE_RATE + CLOCK_ENERGY_GAIN * e + CLOCK_BEAT_GAIN * beatPulse(beats, t);
  };
  const steps = Math.max(1, Math.ceil(durationSec / CLOCK_STEP_SEC));
  const table = new Float64Array(steps + 1);
  for (let i = 1; i <= steps; i += 1) {
    const mid = (i - 0.5) * CLOCK_STEP_SEC;
    table[i] = table[i - 1]! + rateAt(mid) * CLOCK_STEP_SEC;
  }
  const lastRate = rateAt(durationSec);
  return {
    rateAt,
    at(t) {
      if (!(t > 0)) return 0;
      const x = t / CLOCK_STEP_SEC;
      if (x >= steps) return table[steps]! + (t - steps * CLOCK_STEP_SEC) * lastRate;
      const i = Math.floor(x);
      return table[i]! + (table[i + 1]! - table[i]!) * (x - i);
    },
  };
}

const clocks = new WeakMap<object, MusicClock>();

/** The plan's musical clock, built once. */
export function musicClockOf(plan: Pick<SpawnPlan, 'beats' | 'energy' | 'durationSec'>): MusicClock {
  let clock = clocks.get(plan);
  if (!clock) {
    clock = buildMusicClock(plan.beats, plan.energy, plan.durationSec);
    clocks.set(plan, clock);
  }
  return clock;
}

/** Objects that share the ground (they must not drive through each other) and those that share the air. */
const GROUND = new Set(['car', 'bicycle']);

export interface CrowdItem {
  readonly index: number;
  readonly kind: string;
  /** Collision radius in plate units. */
  readonly radius: number;
}

const MARGIN = 1.15;
const RELAX_PASSES = 6;
const HEADING_PROBE_SEC = 0.1;

interface Body {
  item: CrowdItem;
  x: number;
  y: number;
  z: number;
}

function separate(bodies: Body[], seed: number): void {
  for (let pass = 0; pass < RELAX_PASSES; pass += 1) {
    let moved = false;
    for (let i = 0; i < bodies.length; i += 1) {
      const a = bodies[i]!;
      const ground = GROUND.has(a.item.kind);
      for (let j = i + 1; j < bodies.length; j += 1) {
        const b = bodies[j]!;
        if (GROUND.has(b.item.kind) !== ground) continue; // ground and air never meet
        const min = (a.item.radius + b.item.radius) * MARGIN;
        let dx = b.x - a.x;
        let dy = ground ? 0 : b.y - a.y;
        let dz = b.z - a.z;
        const d2 = dx * dx + dy * dy + dz * dz;
        if (d2 >= min * min) continue;
        let d = Math.sqrt(d2);
        if (d < 1e-6) {
          const angle = mulberry32(hashSeed(seed, `crowd:${a.item.index}:${b.item.index}`))() * Math.PI * 2;
          dx = Math.cos(angle);
          dz = Math.sin(angle);
          dy = 0;
          d = 1;
        }
        const push = (min - d) / 2 / d;
        a.x -= dx * push;
        a.z -= dz * push;
        b.x += dx * push;
        b.z += dz * push;
        if (!ground) {
          a.y -= dy * push;
          b.y += dy * push;
        }
        moved = true;
      }
    }
    if (!moved) break;
  }
}

function relaxed(items: readonly CrowdItem[], seed: number, tau: number, size: number): Map<number, Body> {
  const bodies: Body[] = [];
  const base = new Map<number, Pose>();
  for (const item of items) {
    const pose = objectPoseAt(item.kind, seed, item.index, tau, size);
    if (!pose) continue;
    base.set(item.index, pose);
    bodies.push({ item, x: pose.x, y: pose.y, z: pose.z });
  }
  separate(bodies, seed);
  return new Map(bodies.map((b) => [b.item.index, b]));
}

function shortestAngle(from: number, to: number, weight: number): number {
  let d = (to - from) % (Math.PI * 2);
  if (d > Math.PI) d -= Math.PI * 2;
  if (d < -Math.PI) d += Math.PI * 2;
  return from + d * weight;
}

/** Moving records of a plan as crowd items (collision radius from `radiusOf(kind)`), in record order. */
export function crowdItemsOf(plan: Pick<SpawnPlan, 'records'>, radiusOf: (kind: string) => number): CrowdItem[] {
  const items: CrowdItem[] = [];
  for (const r of plan.records) if (MOVING_KINDS.has(r.kind)) items.push({ index: r.index, kind: r.kind, radius: radiusOf(r.kind) });
  return items;
}

/**
 * Poses of every moving object at `t`, keyed by record index. `items` is the whole set of moving records (not only the
 * landed ones), so an object appearing never makes the others jump.
 */
export function crowdPosesAt(plan: SpawnPlan, items: readonly CrowdItem[], t: number): Map<number, Pose> {
  const size = plan.template.terrain.size;
  const clock = musicClockOf(plan);
  const tau = clock.at(t);
  const tauNext = clock.at(t + HEADING_PROBE_SEC);
  const now = relaxed(items, plan.seed, tau, size);
  const next = relaxed(items, plan.seed, tauNext, size);
  const out = new Map<number, Pose>();
  for (const [index, body] of now) {
    const kind = body.item.kind;
    const basePose = objectPoseAt(kind, plan.seed, index, tau, size)!;
    const baseNext = objectPoseAt(kind, plan.seed, index, tauNext, size)!;
    const after = next.get(index)!;
    const vx = (after.x - body.x) / HEADING_PROBE_SEC;
    const vz = (after.z - body.z) / HEADING_PROBE_SEC;
    const bx = (baseNext.x - basePose.x) / HEADING_PROBE_SEC;
    const bz = (baseNext.z - basePose.z) / HEADING_PROBE_SEC;
    const baseSpeed = Math.hypot(bx, bz);
    let yaw = basePose.yaw;
    const wrapped = baseSpeed * HEADING_PROBE_SEC > Math.max(size, 1); // a plane restarting at the edge
    const displaced = Math.hypot(body.x - basePose.x, body.z - basePose.z) > 1e-9 || Math.hypot(after.x - baseNext.x, after.z - baseNext.z) > 1e-9;
    if (displaced && !wrapped && baseSpeed > 1e-6) {
      // Forward speed along the base heading: positive = still going ahead (steer), negative = backing up (keep heading).
      const along = (vx * bx + vz * bz) / baseSpeed;
      const weight = Math.min(1, Math.max(0, along / baseSpeed));
      const smooth = weight * weight * (3 - 2 * weight);
      if (Math.hypot(vx, vz) > 1e-6) yaw = shortestAngle(basePose.yaw, Math.atan2(vz, vx), smooth);
    }
    out.set(index, { x: body.x, y: body.y, z: body.z, yaw });
  }
  return out;
}
