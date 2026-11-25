/**
 * Swimming (I37): how the animals of an underwater world move. Every pose is a pure function of
 * `(seed, objectId, tau, plate size)`, with no state and no physics, so a seek lands exactly where playing would have been.
 *
 * Path: an epicycle (a wide slow circle plus a smaller, faster counter-rotating one) around a home point. The speed
 * never drops to zero (so the heading never spins), it swells and eases like a real animal's, and the turns are long
 * and gentle with the odd loop. The heading is the direction of the velocity, the nose tilts with the vertical speed
 * (pitch) and the body banks into a turn (roll), exactly as fish, sharks and dolphins do. Depth follows a slow wave
 * between the species' own depths (dolphins porpoise, the manta glides, the crab stays on the seabed).
 */
import { hashSeed, mulberry32, uniform } from './prng';
import type { Pose } from './motion';

export interface SwimSpec {
  /** Mean cruising speed in plate metres per musical second. */
  readonly speed: number;
  /** Radius of the roaming area, in half-plates. */
  readonly roam: number;
  /** Depth range as a fraction of the plate size (above the seabed). */
  readonly depth: readonly [number, number];
  /** Seconds of one vertical wave. */
  readonly wave: number;
  /** Stays level and upright (seahorse, jellyfish, crab). */
  readonly upright?: boolean;
  /** Walks sideways (crab): the nose points across the direction of travel. */
  readonly sideways?: boolean;
  /** Quick random-looking wiggle of the heading, in radians (small reef fish). */
  readonly wiggle?: number;
}

/** Swimming kinds (`recipe:<name>`); the animals that stay put (starfish, urchin, anemone, plants) are not here. */
export const SWIMMERS: Readonly<Record<string, SwimSpec>> = {
  'recipe:whale': { speed: 0.9, roam: 1.5, depth: [0.2, 0.46], wave: 40 },
  'recipe:shark': { speed: 1.7, roam: 1.3, depth: [0.08, 0.3], wave: 24 },
  'recipe:dolphin': { speed: 2.8, roam: 1.3, depth: [0.06, 0.4], wave: 9 },
  'recipe:manta_ray': { speed: 1.0, roam: 1.2, depth: [0.1, 0.28], wave: 32 },
  'recipe:sea_turtle': { speed: 0.55, roam: 0.9, depth: [0.05, 0.22], wave: 28 },
  'recipe:jellyfish': { speed: 0.16, roam: 0.7, depth: [0.06, 0.32], wave: 5, upright: true },
  'recipe:octopus': { speed: 0.28, roam: 0.6, depth: [0, 0.05], wave: 14, upright: true },
  'recipe:seahorse': { speed: 0.14, roam: 0.4, depth: [0.03, 0.14], wave: 12, upright: true },
  'recipe:clownfish': { speed: 0.55, roam: 0.4, depth: [0.02, 0.1], wave: 10, wiggle: 0.5 },
  'recipe:fish_school': { speed: 1.8, roam: 1.1, depth: [0.05, 0.26], wave: 18 },
  'recipe:pufferfish': { speed: 0.4, roam: 0.7, depth: [0.04, 0.18], wave: 16 },
  'recipe:crab': { speed: 0.22, roam: 0.4, depth: [0, 0], wave: 10, upright: true, sideways: true },
};

const MAX_PITCH = 0.45;
const MAX_ROLL = 0.5;

const clamp = (v: number, lo: number, hi: number): number => Math.min(hi, Math.max(lo, v));

export function isSwimmer(kind: string): boolean {
  return kind in SWIMMERS;
}

export function swimAt(kind: string, seed: number, objectId: string, tau: number, size: number): Pose | null {
  const spec = SWIMMERS[kind];
  if (!spec) return null;
  const rng = mulberry32(hashSeed(seed, `swim:${objectId}`));
  const half = size / 2;
  const roam = spec.roam * half;
  const a = roam * 0.62;
  const b = roam * 0.3;
  const cx = uniform(rng, -0.8, 0.8) * half;
  const cz = uniform(rng, -0.8, 0.8) * half;
  const w1 = spec.speed / a;
  const w2 = w1 * uniform(rng, 1.1, 1.4);
  const d1 = rng() < 0.5 ? 1 : -1;
  const d2 = rng() < 0.5 ? 1 : -1;
  const p1 = uniform(rng, 0, Math.PI * 2);
  const p2 = uniform(rng, 0, Math.PI * 2);
  const e = uniform(rng, 0.85, 1);
  const th1 = d1 * w1 * tau + p1;
  const th2 = d2 * w2 * tau + p2;
  const x = cx + a * Math.cos(th1) + b * Math.cos(th2);
  const z = cz + a * e * Math.sin(th1) + b * Math.sin(th2);
  const vx = -a * w1 * d1 * Math.sin(th1) - b * w2 * d2 * Math.sin(th2);
  const vz = a * e * w1 * d1 * Math.cos(th1) + b * w2 * d2 * Math.cos(th2);
  const ax = -a * w1 * w1 * Math.cos(th1) - b * w2 * w2 * Math.cos(th2);
  const az = -a * e * w1 * w1 * Math.sin(th1) - b * w2 * w2 * Math.sin(th2);
  const speed2 = vx * vx + vz * vz;
  const turn = (vx * az - vz * ax) / Math.max(speed2, 1e-9); // rad per musical second, + toward +z (to the right)

  // Depth: a slow wave between the species' depths.
  const lo = spec.depth[0] * size;
  const hi = spec.depth[1] * size;
  const wy = (Math.PI * 2) / spec.wave;
  const py = uniform(rng, 0, Math.PI * 2);
  const mid = (lo + hi) / 2;
  const amp = (hi - lo) / 2;
  const y = mid + amp * Math.sin(wy * tau + py);
  const vy = amp * wy * Math.cos(wy * tau + py);

  let yaw = Math.atan2(vz, vx);
  if (spec.wiggle) yaw += spec.wiggle * 0.3 * Math.sin(tau * 5.3 + p1) * Math.sin(tau * 1.7 + p2);
  if (spec.sideways) yaw += Math.PI / 2;
  if (spec.upright) return { x, y, z, yaw, pitch: 0, roll: 0 };
  const pitch = clamp(Math.atan2(vy, Math.sqrt(speed2)), -MAX_PITCH, MAX_PITCH);
  const roll = clamp(turn * 1.6, -MAX_ROLL, MAX_ROLL);
  return { x, y, z, yaw, pitch, roll };
}
