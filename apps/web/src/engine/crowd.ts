/**
 * Crowd of moving objects (I31, reworked in I38): cars, bicycles, planes, clouds and swimming animals that follow the
 * music, move calmly and never overlap.
 *
 * - **Rhythm and context.** Objects do not move on the wall-clock `t` but on a *musical clock* whose rate is low in a
 *   calm passage, higher in a loud one and surges on every beat (`musicClockOf`): a quiet verse crawls, a loud chorus
 *   rushes. The clock is a table integrated once per plan, so asking for any `t` stays O(log n) and a seek lands
 *   exactly where playing would have been.
 * - **Calm.** The clock only varies between about 0.6 and 1.15 musical seconds per second, and a beat is a soft nudge.
 * - **Traffic never collides.** Cars and bicycles drive on the road network (`roads.ts`): every lane holds evenly
 *   spaced vehicles at one speed, so none ever catches another; roads cross over bridges and through tunnels, so two
 *   vehicles are never at the same spot at the same level; and nothing else stands on a road.
 * - **Few animals and planes at a time.** Each kind shows only its most recent `cap` records (older ones leave), so the
 *   scene stays readable. Planes, clouds and swimmers are kept apart in 3D by a deterministic relaxation.
 *
 * Everything is a pure function of `(plan, t)`: no state, no physics stepping.
 */
import { hashSeed, mulberry32 } from './prng';
import { MOVING_KINDS, objectPoseAt, type Pose } from './motion';
import { FLYERS, isSwimmer, SWIMMERS } from './swim';
import { worldSize } from './city';
import { buildRoads, LANE_OFFSET, roadPoint, type Road } from './roads';
import type { SpawnPlan } from './spawn-plan';

/** Rate of the musical clock: calm floor, extra rate at full energy, and the surge of a beat. */
export const CLOCK_BASE_RATE = 0.6;
export const CLOCK_ENERGY_GAIN = 0.45;
export const CLOCK_BEAT_GAIN = 0.1;
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

/** Footprint of the vehicles (metres), to space them on a lane. */
const VEHICLE_LENGTH: Readonly<Record<string, number>> = { car: 0.75, bicycle: 0.3 };
const TRAFFIC_MAX: Readonly<Record<string, number>> = { car: 60, bicycle: 16 };
const TRAFFIC_ROAD: Readonly<Record<string, 'main' | 'bike'>> = { car: 'main', bicycle: 'bike' };
const AIR_CAP: Readonly<Record<string, number>> = { airplane: 3, cloud: 10 };
const SPACING = 1.9;

export interface CrowdItem {
  readonly index: number;
  readonly kind: string;
  /** Collision radius in plate units. */
  readonly radius: number;
}

interface Lane {
  readonly road: Road;
  readonly dir: 1 | -1;
}
interface Traffic {
  readonly cap: number;
  readonly lanes: readonly Lane[];
}

const trafficCache = new WeakMap<object, Map<string, Traffic>>();

function trafficOf(plan: Pick<SpawnPlan, 'seed' | 'template'>, kind: string): Traffic {
  let perPlan = trafficCache.get(plan);
  if (!perPlan) {
    perPlan = new Map();
    trafficCache.set(plan, perPlan);
  }
  let found = perPlan.get(kind);
  if (!found) {
    const network = buildRoads(plan.seed, worldSize(plan.template));
    const roads = network.roads.filter((r) => r.kind === TRAFFIC_ROAD[kind]);
    const lanes: Lane[] = roads.flatMap((road) => [{ road, dir: 1 as const }, { road, dir: -1 as const }]);
    const perLane = Math.min(...roads.map((r) => Math.floor(r.length / ((VEHICLE_LENGTH[kind] ?? 0.5) * SPACING))));
    const cap = Math.max(1, Math.min(TRAFFIC_MAX[kind] ?? 8, lanes.length * Math.max(1, perLane)));
    found = { cap, lanes };
    perPlan.set(kind, found);
  }
  return found;
}

/** Pose of the vehicle in traffic slot `slot` at musical time `tau`: evenly spaced on its lane, at the lane speed. */
function trafficPose(traffic: Traffic, slot: number, tau: number): Pose {
  const n = traffic.lanes.length;
  const laneIndex = slot % n;
  const lane = traffic.lanes[laneIndex]!;
  const count = Math.ceil((traffic.cap - laneIndex) / n);
  const k = Math.floor(slot / n);
  const length = lane.road.length;
  const s0 = ((k + ((laneIndex * 0.37) % 1)) / count) * length;
  const s = s0 + lane.dir * lane.road.speed * tau;
  const p = roadPoint(lane.road, s);
  const off = lane.dir * LANE_OFFSET;
  const x = p.x - p.tz * off;
  const z = p.z + p.tx * off;
  const hx = p.tx * lane.dir;
  const hz = p.tz * lane.dir;
  return { x, y: Math.max(p.y, -1.2), z, yaw: Math.atan2(hz, hx), pitch: Math.atan(p.slope * lane.dir), roll: 0 };
}
/** Index of the first element > t (landTimes is sorted). */
function landedCount(times: readonly number[], t: number): number {
  let lo = 0;
  let hi = times.length;
  while (lo < hi) {
    const mid = (lo + hi) >> 1;
    if (times[mid]! <= t) lo = mid + 1;
    else hi = mid;
  }
  return lo;
}

interface Rank {
  readonly track: number;
  readonly k: number;
}
const rankCache = new WeakMap<object, Map<number, Rank>>();

function ranksOf(plan: Pick<SpawnPlan, 'tracks'>): Map<number, Rank> {
  let ranks = rankCache.get(plan);
  if (!ranks) {
    ranks = new Map();
    plan.tracks.forEach((track, ti) => track.recordIndices.forEach((index, k) => ranks!.set(index, { track: ti, k })));
    rankCache.set(plan, ranks);
  }
  return ranks;
}

/** How many records of a kind are shown at once (the most recent ones); `Infinity` for a kind with no limit. */
function capOf(plan: Pick<SpawnPlan, 'seed' | 'template'>, kind: string): number {
  if (kind in TRAFFIC_ROAD) return trafficOf(plan, kind).cap;
  if (kind in AIR_CAP) return AIR_CAP[kind]!;
  return SWIMMERS[kind]?.cap ?? Infinity;
}

const MARGIN = 1.15;
const RELAX_PASSES = 6;
const HEADING_PROBE_SEC = 0.1;
const HIDDEN: Pose = { x: 0, y: -100, z: 0, yaw: 0, hidden: true };

interface Body {
  item: CrowdItem;
  x: number;
  y: number;
  z: number;
}

/** Keeps planes, clouds and swimmers apart in 3D: deterministic position-based relaxation. */
function separate(bodies: Body[], seed: number): void {
  for (let pass = 0; pass < RELAX_PASSES; pass += 1) {
    let moved = false;
    for (let i = 0; i < bodies.length; i += 1) {
      const a = bodies[i]!;
      for (let j = i + 1; j < bodies.length; j += 1) {
        const b = bodies[j]!;
        const min = (a.item.radius + b.item.radius) * MARGIN;
        let dx = b.x - a.x;
        let dy = b.y - a.y;
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
        a.y -= dy * push;
        b.y += dy * push;
        moved = true;
      }
    }
    if (!moved) break;
  }
}

function relaxed(items: readonly CrowdItem[], seed: number, tau: number, size: number): Map<number, Body> {
  const bodies: Body[] = [];
  for (const item of items) {
    const pose = objectPoseAt(item.kind, seed, item.index, tau, size);
    if (!pose) continue;
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
export function crowdItemsOf(plan: Pick<SpawnPlan, 'records' | 'template'>, radiusOf: (kind: string) => number): CrowdItem[] {
  const items: CrowdItem[] = [];
  const sea = plan.template.fx.environment === 'underwater'; // animals swim only in water
  for (const r of plan.records) if (MOVING_KINDS.has(r.kind) || ((sea || FLYERS.has(r.kind)) && isSwimmer(r.kind))) items.push({ index: r.index, kind: r.kind, radius: radiusOf(r.kind) });
  return items;
}

/**
 * Poses of every moving object at `t`, keyed by record index. `items` is the whole set of moving records (not only the
 * landed ones), so an object appearing never makes the others jump. A record that has left (its kind shows only its most
 * recent ones) has `hidden: true`.
 */
export function crowdPosesAt(plan: SpawnPlan, items: readonly CrowdItem[], t: number): Map<number, Pose> {
  const size = worldSize(plan.template);
  const clock = musicClockOf(plan);
  const tau = clock.at(t);
  const tauNext = clock.at(t + HEADING_PROBE_SEC);
  const out = new Map<number, Pose>();
  const ranks = ranksOf(plan);
  const landed = new Map<number, number>();
  const air: CrowdItem[] = [];
  for (const item of items) {
    const cap = capOf(plan, item.kind);
    const rank = ranks.get(item.index);
    if (rank !== undefined && Number.isFinite(cap)) {
      let n = landed.get(rank.track);
      if (n === undefined) {
        n = landedCount(plan.tracks[rank.track]!.landTimes, t);
        landed.set(rank.track, n);
      }
      if (rank.k < n - cap) {
        out.set(item.index, HIDDEN);
        continue;
      }
      if (item.kind in TRAFFIC_ROAD) {
        const traffic = trafficOf(plan, item.kind);
        out.set(item.index, trafficPose(traffic, rank.k % traffic.cap, tau));
        continue;
      }
    }
    air.push(item);
  }
  const now = relaxed(air, plan.seed, tau, size);
  const next = relaxed(air, plan.seed, tauNext, size);
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
      const along = (vx * bx + vz * bz) / baseSpeed;
      const weight = Math.min(1, Math.max(0, along / baseSpeed));
      const smooth = weight * weight * (3 - 2 * weight);
      if (Math.hypot(vx, vz) > 1e-6) yaw = shortestAngle(basePose.yaw, Math.atan2(vz, vx), smooth);
    }
    out.set(index, { x: body.x, y: Math.max(0, body.y), z: body.z, yaw, pitch: basePose.pitch, roll: basePose.roll });
  }
  return out;
}


/**
 * Where a vehicle that lands at `landAt` is on its road at that moment: the note falls onto the road and the car drives
 * off from there. `k` is the rank of the record among the vehicles of its kind.
 */
export function vehicleLanding(plan: SpawnPlan, kind: string, k: number, landAt: number): { x: number; z: number } | null {
  if (!(kind in TRAFFIC_ROAD)) return null;
  const traffic = trafficOf(plan, kind);
  if (traffic.lanes.length === 0) return null;
  const pose = trafficPose(traffic, k % traffic.cap, musicClockOf(plan).at(landAt));
  return { x: pose.x, z: pose.z };
}
