/**
 * Street traffic (I41): cars and bicycles of a city drive on its street grid, as on real roads.
 *
 *  - Every vehicle follows a closed route round a rectangle of blocks, on the right-hand lane, turning right at the
 *    corners (rounded), so it never leaves the streets and never crosses the opposite lane.
 *  - Every crossing has traffic lights (`signalColor`: green, yellow, red, one street after the other). A vehicle stops
 *    at the stop line on red and on yellow when it can still stop, and goes on at green.
 *  - A vehicle keeps its distance to the one ahead and brakes smoothly (no overlap, no jump).
 *
 * The world is a pure function of `(plan, t)`: the whole song is simulated once per plan in fixed steps (a table of
 * poses) and every query reads it, so a seek lands exactly where playing would have been.
 */
import { CITY_FOOTPRINT, cityFront, cityOf, inLake, signalColor, signalPhase, STREET_HALF, type City } from './city';
import { hashSeed, mulberry32, uniform } from './prng';
import type { Pose } from './motion';
import type { SpawnPlan } from './spawn-plan';

type VehicleKind = 'car' | 'bicycle';
export const STREET_VEHICLES: ReadonlySet<string> = new Set(['car', 'bicycle']);

const LANE = 0.07;
const TURN_RADIUS = 0.1;
const DT = 0.1;
const STEP = 0.02; // spacing of the route samples
const STOP_BEFORE = STREET_HALF + 0.05; // stop line: this far from the crossing centre
const BRAKE = 1.1; // comfortable deceleration, plate m/s²
const ACCEL = 0.7;
const MIN_GAP = 0.05;
const LOOK_AHEAD = 0.9;
const DECK_Y = 0.05;

const SPEED: Readonly<Record<VehicleKind, number>> = { car: 0.62, bicycle: 0.3 };
const LENGTH: Readonly<Record<VehicleKind, number>> = { car: CITY_FOOTPRINT.car!, bicycle: CITY_FOOTPRINT.bicycle! };

interface Stop {
  /** Arc length of the stop line on the route. */
  readonly s: number;
  readonly axis: 0 | 1;
  readonly phase: number;
}

interface Route {
  readonly length: number;
  readonly x: Float64Array;
  readonly z: Float64Array;
  readonly stops: readonly Stop[];
  /** Distance of the farthest corner from the centre: the vehicle is shown once the city has reached it. */
  readonly reach: number;
}

interface Table {
  readonly steps: number;
  readonly x: Float32Array[];
  readonly z: Float32Array[];
  readonly yaw: Float32Array[];
}

export interface StreetTraffic {
  readonly caps: Readonly<Record<VehicleKind, number>>;
  /** Pose of the vehicle in slot `slot` of its kind at `t`; `null` while the city has not reached its route. */
  poseAt(kind: VehicleKind, slot: number, t: number): Pose | null;
}

function routeOf(city: City, i0: number, j0: number, i1: number, j1: number, lines: readonly number[], lane: number): Route {
  const cx0 = lines[i0]!;
  const cx1 = lines[i1]!;
  const cz0 = lines[j0]!;
  const cz1 = lines[j1]!;
  const x0 = cx0 + lane;
  const x1 = cx1 - lane;
  const z0 = cz0 + lane;
  const z1 = cz1 - lane;
  const R = Math.min(TURN_RADIUS, (x1 - x0) / 4, (z1 - z0) / 4);
  const xs: number[] = [];
  const zs: number[] = [];
  const stops: Stop[] = [];
  let s = 0;
  const push = (x: number, z: number): void => {
    if (xs.length > 0) s += Math.hypot(x - xs[xs.length - 1]!, z - zs[zs.length - 1]!);
    xs.push(x);
    zs.push(z);
  };
  // Four edges, clockwise (x to the right, z down): along +x on top, +z on the right, -x at the bottom, -z on the left.
  const edges: { ax: number; az: number; bx: number; bz: number; dx: number; dz: number; axis: 0 | 1; cross: number[] }[] = [
    { ax: x0 + R, az: z0, bx: x1 - R, bz: z0, dx: 1, dz: 0, axis: 0, cross: lines.slice(i0 + 1, i1 + 1).map((x) => x) },
    { ax: x1, az: z0 + R, bx: x1, bz: z1 - R, dx: 0, dz: 1, axis: 1, cross: lines.slice(j0 + 1, j1 + 1) },
    { ax: x1 - R, az: z1, bx: x0 + R, bz: z1, dx: -1, dz: 0, axis: 0, cross: lines.slice(i0, i1).reverse() },
    { ax: x0, az: z1 - R, bx: x0, bz: z0 + R, dx: 0, dz: -1, axis: 1, cross: lines.slice(j0, j1).reverse() },
  ];
  const rowZ = [cz0, cx1, cz1, cx0]; // the street each edge runs along
  const corners = [
    [x1 - R, z0 + R, -Math.PI / 2],
    [x1 - R, z1 - R, 0],
    [x0 + R, z1 - R, Math.PI / 2],
    [x0 + R, z0 + R, Math.PI],
  ] as const;
  edges.forEach((e, k) => {
    const start = s + (xs.length === 0 ? 0 : Math.hypot(e.ax - xs[xs.length - 1]!, e.az - zs[zs.length - 1]!));
    const len = Math.hypot(e.bx - e.ax, e.bz - e.az);
    const n = Math.max(1, Math.ceil(len / STEP));
    for (let m = 0; m <= n; m += 1) push(e.ax + ((e.bx - e.ax) * m) / n, e.az + ((e.bz - e.az) * m) / n);
    // Stop lines before each crossing of the edge (the last one is the corner crossing, where the vehicle turns).
    for (const c of e.cross) {
      const u = e.dx !== 0 ? (c - e.ax) * e.dx : (c - e.az) * e.dz; // distance along the edge from its start to the crossing
      const sx = e.axis === 0 ? c : rowZ[k]!;
      const sz = e.axis === 0 ? rowZ[k]! : c;
      stops.push({ s: start + u - STOP_BEFORE, axis: e.axis, phase: signalPhase(sx, sz) });
    }
    const [ox, oz, a0] = corners[k]!;
    for (let m = 1; m <= 6; m += 1) {
      const a = a0 + ((Math.PI / 2) * m) / 6;
      push(ox + Math.cos(a) * R, oz + Math.sin(a) * R);
    }
  });
  push(xs[0]!, zs[0]!); // close the loop
  const reach = Math.max(...[cx0, cx1].flatMap((x) => [cz0, cz1].map((z) => Math.hypot(x, z))));
  void city;
  return { length: s, x: Float64Array.from(xs), z: Float64Array.from(zs), stops: stops.filter((st) => st.s > 0 && st.s < s), reach };
}

function pointAt(route: Route, s: number): { x: number; z: number; yaw: number } {
  const n = route.x.length - 1;
  const total = route.length;
  const u = ((s % total) + total) % total;
  // Samples are not evenly spaced (rounded corners), so search the cumulative length lazily with a guess then a walk.
  const cum = cumulative(route);
  let i = Math.min(n - 1, Math.floor((u / total) * n));
  while (i > 0 && cum[i]! > u) i -= 1;
  while (i < n - 1 && cum[i + 1]! < u) i += 1;
  const a = cum[i]!;
  const b = cum[i + 1]!;
  const f = b > a ? (u - a) / (b - a) : 0;
  const x = route.x[i]! + (route.x[i + 1]! - route.x[i]!) * f;
  const z = route.z[i]! + (route.z[i + 1]! - route.z[i]!) * f;
  return { x, z, yaw: Math.atan2(route.z[i + 1]! - route.z[i]!, route.x[i + 1]! - route.x[i]!) };
}

const cumCache = new WeakMap<Route, Float64Array>();
function cumulative(route: Route): Float64Array {
  let c = cumCache.get(route);
  if (!c) {
    c = new Float64Array(route.x.length);
    for (let i = 1; i < c.length; i += 1) c[i] = c[i - 1]! + Math.hypot(route.x[i]! - route.x[i - 1]!, route.z[i]! - route.z[i - 1]!);
    cumCache.set(route, c);
  }
  return c;
}

interface Spec {
  readonly i0: number;
  readonly j0: number;
  readonly i1: number;
  readonly j1: number;
  readonly reach: number;
}

/** Rectangles of blocks whose four crossings are on dry land, nearest the centre first (routes are built when chosen). */
function candidateSpecs(city: City, lines: readonly number[], maxBlocks: number): Spec[] {
  const n = lines.length - 1;
  const out: Spec[] = [];
  const dry = (i: number, j: number): boolean => !inLake(city, lines[i]!, lines[j]!, 0.35);
  for (let i0 = 0; i0 < n; i0 += 1) {
    for (let j0 = 0; j0 < n; j0 += 1) {
      for (let w = 1; w <= maxBlocks && i0 + w <= n; w += 1) {
        for (let h = 1; h <= maxBlocks && j0 + h <= n; h += 1) {
          if (!dry(i0, j0) || !dry(i0 + w, j0) || !dry(i0, j0 + h) || !dry(i0 + w, j0 + h)) continue;
          const reach = Math.max(...[i0, i0 + w].flatMap((i) => [j0, j0 + h].map((j) => Math.hypot(lines[i]!, lines[j]!))));
          out.push({ i0, j0, i1: i0 + w, j1: j0 + h, reach });
        }
      }
    }
  }
  return out.sort((p, q) => p.reach - q.reach);
}

/** Rough point at fraction `f` of the perimeter of a rectangle of blocks (clockwise from its top-left corner). */
function rectPoint(lines: readonly number[], sp: Spec, f: number): { x: number; z: number } {
  const x0 = lines[sp.i0]!;
  const x1 = lines[sp.i1]!;
  const z0 = lines[sp.j0]!;
  const z1 = lines[sp.j1]!;
  const w = x1 - x0;
  const h = z1 - z0;
  const d = f * 2 * (w + h);
  if (d < w) return { x: x0 + d, z: z0 };
  if (d < w + h) return { x: x1, z: z0 + (d - w) };
  if (d < 2 * w + h) return { x: x1 - (d - w - h), z: z1 };
  return { x: x0, z: z1 - (d - 2 * w - h) };
}

function simulate(city: City, seed: number, durationSec: number): { traffic: Table; caps: Record<VehicleKind, number>; routes: Route[]; kinds: VehicleKind[] } {
  const lines = [...new Set(city.streets.map((st) => st.at))].sort((a, b) => a - b);
  const blocks = (lines.length - 1) * (lines.length - 1);
  const caps: Record<VehicleKind, number> = { car: Math.max(6, Math.min(44, Math.round(blocks / 3))), bicycle: Math.max(2, Math.min(10, Math.round(blocks / 14))) };
  const rng = mulberry32(hashSeed(seed, 'traffic'));
  const total = caps.car + caps.bicycle;
  const kinds: VehicleKind[] = [...Array(caps.car).fill('car'), ...Array(caps.bicycle).fill('bicycle')];
  const carRoutes = candidateSpecs(city, lines, 2);
  const bikeRoutes = candidateSpecs(city, lines, 1);
  const built = new Map<string, Route>();
  const build = (sp: Spec, lane: number): Route => {
    const key = `${sp.i0},${sp.j0},${sp.i1},${sp.j1},${lane}`;
    let route = built.get(key);
    if (!route) {
      route = routeOf(city, sp.i0, sp.j0, sp.i1, sp.j1, lines, lane);
      built.set(key, route);
    }
    return route;
  };
  const routes: Route[] = [];
  const offsets: number[] = [];
  const spots: { x: number; z: number }[] = [];
  kinds.forEach((kind, slot) => {
    const pool = kind === 'car' ? carRoutes : bikeRoutes;
    const rank = kind === 'car' ? slot : slot - caps.car;
    const count = kind === 'car' ? caps.car : caps.bicycle;
    // Slot k is for the k-th note that lands: a route inside the part of the city that has grown by then.
    const share = Math.sqrt((rank + 0.5) / count);
    const upTo = Math.max(1, Math.floor(pool.length * Math.min(1, 0.12 + 0.9 * share)));
    const lane = kind === 'car' ? LANE : LANE + 0.025;
    let best: { spec: Spec; f: number } | null = null;
    for (let attempt = 0; attempt < 40; attempt += 1) {
      const spec = pool[Math.floor(rng() * upTo)]!;
      const f = rng();
      const p = rectPoint(lines, spec, f);
      best = { spec, f };
      if (spots.every((o) => Math.hypot(o.x - p.x, o.z - p.z) > 0.45)) break;
    }
    const chosen = best!;
    const route = build(chosen.spec, lane);
    routes.push(route);
    offsets.push(chosen.f * route.length);
    spots.push(rectPoint(lines, chosen.spec, chosen.f));
  });

  const steps = Math.ceil(durationSec / DT) + 1;
  const table: Table = {
    steps,
    x: Array.from({ length: total }, () => new Float32Array(steps + 1)),
    z: Array.from({ length: total }, () => new Float32Array(steps + 1)),
    yaw: Array.from({ length: total }, () => new Float32Array(steps + 1)),
  };
  const s = offsets.slice();
  const v = kinds.map((k) => SPEED[k] * uniform(rng, 0.8, 1));
  const vmax = kinds.map((k) => SPEED[k] * uniform(rng, 0.9, 1));
  const px = new Float64Array(total);
  const pz = new Float64Array(total);
  const pyaw = new Float64Array(total);
  const record = (step: number): void => {
    for (let c = 0; c < total; c += 1) {
      const p = pointAt(routes[c]!, s[c]!);
      px[c] = p.x;
      pz[c] = p.z;
      pyaw[c] = p.yaw;
      table.x[c]![step] = p.x;
      table.z[c]![step] = p.z;
      table.yaw[c]![step] = p.yaw;
    }
  };
  record(0);
  for (let step = 0; step < steps; step += 1) {
    const t = step * DT;
    for (let c = 0; c < total; c += 1) {
      const route = routes[c]!;
      let limit = vmax[c]!;
      // Next stop line ahead (cyclic): stop for a red or yellow light that can still be obeyed.
      let best = Infinity;
      let bestStop: Stop | null = null;
      for (const stop of route.stops) {
        let d = stop.s - s[c]! % route.length;
        if (d < -0.02) d += route.length;
        if (d >= -0.02 && d < best) {
          best = d;
          bestStop = stop;
        }
      }
      if (bestStop && best < 1.2) {
        const color = signalColor(bestStop.axis, t, bestStop.phase);
        const stoppable = (v[c]! * v[c]!) / (2 * BRAKE) <= Math.max(0, best) + 0.02;
        if (color === 0 || (color === 1 && stoppable)) {
          if (best > -0.015) limit = Math.min(limit, Math.sqrt(2 * BRAKE * Math.max(0, best - 0.005)));
        }
      }
      // Leader: the closest vehicle ahead in the same direction on the same lane.
      const hx = Math.cos(pyaw[c]!);
      const hz = Math.sin(pyaw[c]!);
      for (let o = 0; o < total; o += 1) {
        if (o === c) continue;
        const dx = px[o]! - px[c]!;
        const dz = pz[o]! - pz[c]!;
        const ahead = dx * hx + dz * hz;
        if (ahead <= 0 || ahead > LOOK_AHEAD) continue;
        const side = Math.abs(-dx * hz + dz * hx);
        if (side > 0.09) continue;
        const gap = ahead - (LENGTH[kinds[c]!] + LENGTH[kinds[o]!]) / 2 - MIN_GAP;
        limit = Math.min(limit, Math.sqrt(2 * BRAKE * Math.max(0, gap)));
      }
      const target = Math.max(0, limit);
      v[c] = target > v[c]! ? Math.min(target, v[c]! + ACCEL * DT) : Math.max(target, v[c]! - BRAKE * 1.5 * DT);
      s[c] = s[c]! + v[c]! * DT;
    }
    record(step + 1);
  }
  return { traffic: table, caps, routes, kinds };
}

const cache = new WeakMap<object, StreetTraffic>();

/** Traffic of the city of a plan (cached per plan; the whole song is simulated once). */
export function streetTrafficOf(plan: Pick<SpawnPlan, 'seed' | 'template' | 'durationSec'>): StreetTraffic {
  const hit = cache.get(plan);
  if (hit) return hit;
  const city = cityOf(plan.template, plan.seed);
  const sim = simulate(city, plan.seed, Math.max(10, plan.durationSec + 2));
  const base: Record<VehicleKind, number> = { car: 0, bicycle: sim.caps.car };
  const traffic: StreetTraffic = {
    caps: sim.caps,
    poseAt(kind, slot, t) {
      const c = base[kind] + (slot % sim.caps[kind]);
      const front = cityFront(city, t, plan.durationSec);
      if (sim.routes[c]!.reach > front + 0.5) return null;
      const f = Math.min(sim.traffic.steps, Math.max(0, t / DT));
      const i = Math.floor(f);
      const k = Math.min(1, f - i);
      const j = Math.min(sim.traffic.steps, i + 1);
      const x = sim.traffic.x[c]![i]! + (sim.traffic.x[c]![j]! - sim.traffic.x[c]![i]!) * k;
      const z = sim.traffic.z[c]![i]! + (sim.traffic.z[c]![j]! - sim.traffic.z[c]![i]!) * k;
      const a = sim.traffic.yaw[c]![i]!;
      let d = sim.traffic.yaw[c]![j]! - a;
      d = Math.atan2(Math.sin(d), Math.cos(d));
      const onBridge = city.bridges.some((b) => (b.axis === 'x' ? Math.abs(z - b.at) < 0.25 && x > b.from && x < b.to : Math.abs(x - b.at) < 0.25 && z > b.from && z < b.to));
      return { x, y: onBridge ? DECK_Y : 0, z, yaw: a + d * k, pitch: 0, roll: 0 };
    },
  };
  cache.set(plan, traffic);
  return traffic;
}
