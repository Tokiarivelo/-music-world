/**
 * Motion of catalog objects (I8 task 4): clouds drift, cars follow a closed path, planes cross the sky. Every position is
 * a pure function of `(seed, objectId, t)`: no state, no physics, so a seek lands exactly where playing would have
 * been (the world stays a function of `(plan, t)`). Distances are plate metres; angles radians.
 */
import { hashSeed, mulberry32, uniform } from './prng';
import { swimAt } from './swim';

export interface Vec3 {
  readonly x: number;
  readonly y: number;
  readonly z: number;
}

export interface Pose extends Vec3 {
  /** Heading around the up axis (0 = +x), so a car or a plane faces where it goes. */
  readonly yaw: number;
  /** Nose up (+) or down (-), radians; only swimming animals have it. */
  readonly pitch?: number;
  /** Bank around the heading, + = right side down, radians; only swimming animals have it. */
  readonly roll?: number;
  /** The record has left the scene (its kind shows only its most recent ones): draw nothing. */
  readonly hidden?: boolean;
}

export interface Bounds {
  readonly halfWidth: number; // along x
  readonly halfDepth: number; // along z
}

function stream(seed: number, objectId: string): () => number {
  return mulberry32(hashSeed(seed, `motion:${objectId}`));
}

/** Positive modulo: `wrap(-1, 4) === 3`. */
export function wrap(value: number, period: number): number {
  return ((value % period) + period) % period;
}

/**
 * A cloud: starts anywhere in the area, drifts along one fixed direction at 0.05–0.25 m/s, wraps around so the sky stays
 * full. Height and a slow bob come from the object's own stream.
 */
export function driftAt(seed: number, objectId: string, t: number, area: Bounds, heightRange: readonly [number, number]): Pose {
  const rng = stream(seed, objectId);
  const x0 = uniform(rng, -area.halfWidth, area.halfWidth);
  const z0 = uniform(rng, -area.halfDepth, area.halfDepth);
  const heading = uniform(rng, 0, Math.PI * 2);
  const speed = uniform(rng, 0.03, 0.12); // slow: a few metres a second at the big scale
  const height = uniform(rng, heightRange[0], heightRange[1]);
  const bobPhase = uniform(rng, 0, Math.PI * 2);
  const width = area.halfWidth * 2;
  const depth = area.halfDepth * 2;
  const x = wrap(x0 + area.halfWidth + Math.cos(heading) * speed * t, width) - area.halfWidth;
  const z = wrap(z0 + area.halfDepth + Math.sin(heading) * speed * t, depth) - area.halfDepth;
  return { x, y: height + Math.sin(t * 0.2 + bobPhase) * height * 0.02, z, yaw: heading };
}

export interface LoopPath {
  /** Centre and radii of an oval ring road. */
  readonly cx: number;
  readonly cz: number;
  readonly rx: number;
  readonly rz: number;
  readonly y: number;
}

/** A car on an oval ring road at constant speed (1–4 m/s), either direction, starting at its own point on the ring. */
export function loopAt(seed: number, objectId: string, t: number, path: LoopPath): Pose {
  const rng = stream(seed, objectId);
  const phase0 = uniform(rng, 0, Math.PI * 2);
  const speed = uniform(rng, 1, 4);
  const direction = rng() < 0.5 ? 1 : -1;
  // Angular speed from the mean radius, so a longer ring takes longer.
  // Lanes: each direction keeps to its own side of the road (the two ways never share a line) and every car has a small
  // lane offset of its own, so two cars that meet pass each other instead of colliding.
  const lane = 1 + direction * 0.07 + uniform(rng, -0.025, 0.025);
  const rx = path.rx * lane;
  const rz = path.rz * lane;
  const omega = (direction * speed) / ((rx + rz) / 2);
  const a = phase0 + omega * t;
  const x = path.cx + Math.cos(a) * rx;
  const z = path.cz + Math.sin(a) * rz;
  const dx = -Math.sin(a) * rx * direction;
  const dz = Math.cos(a) * rz * direction;
  return { x, y: path.y, z, yaw: Math.atan2(dz, dx) };
}

export interface FlightLane {
  readonly halfLength: number; // the plane crosses [-halfLength, +halfLength] along its heading, then restarts
  readonly altitude: readonly [number, number];
  readonly halfWidth: number; // lanes are spread across z
}

/**
 * A plane crossing the area at a calm constant speed (2–4.5 m/s) along x, restarting at the edge. With `slot` (its place
 * among the planes) it gets its own altitude and lane from the golden ratio, so planes never share a level or a line.
 */
export function flightAt(seed: number, objectId: string, t: number, lane: FlightLane, slot?: number): Pose {
  const rng = stream(seed, objectId);
  const offset = uniform(rng, 0, lane.halfLength * 2);
  const speed = uniform(rng, 2.2, 4.5);
  const direction = rng() < 0.5 ? 1 : -1;
  let z = uniform(rng, -lane.halfWidth, lane.halfWidth);
  let y = uniform(rng, lane.altitude[0], lane.altitude[1]);
  if (slot !== undefined) {
    z = (((slot * 0.382 + 0.1) % 1) * 2 - 1) * lane.halfWidth;
    y = lane.altitude[0] + ((slot * 0.618) % 1) * (lane.altitude[1] - lane.altitude[0]);
  }
  const along = wrap(offset + speed * t, lane.halfLength * 2) - lane.halfLength;
  return { x: along * direction, y, z, yaw: direction === 1 ? 0 : Math.PI };
}

/** Kinds that move (I8): clouds drift, cars and bicycles circle a ring road, planes cross the sky. */
export const MOVING_KINDS: ReadonlySet<string> = new Set(['cloud', 'car', 'bicycle', 'airplane']);

/**
 * Pose of a moving object at time `t` on a plate of `size` metres, or `null` for a kind that stands still. The object id
 * is the structure's record index, so every instance has its own stream; a pure function of `(seed, kind, id, t, size)`.
 */
export function objectPoseAt(kind: string, seed: number, index: number, t: number, size: number): Pose | null {
  const id = `${kind}:${index}`;
  const half = size / 2;
  switch (kind) {
    case 'cloud':
      return driftAt(seed, id, t, { halfWidth: half * 3.6, halfDepth: half * 3.6 }, [6, 11]);
    case 'airplane':
      return flightAt(seed, id, t, { halfLength: half * 3.8, halfWidth: half * 2.6, altitude: [14, 19] }, index);
    case 'car':
      return loopAt(seed, id, t, { cx: 0, cz: 0, rx: half * 0.7, rz: half * 0.5, y: 0 });
    case 'bicycle':
      return loopAt(seed, id, t, { cx: 0, cz: 0, rx: half * 0.45, rz: half * 0.3, y: 0 });
    default:
      return swimAt(kind, seed, id, t, size);
  }
}
