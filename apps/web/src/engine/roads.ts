/**
 * Road network (I38): closed roads that cross each other, with flyovers and tunnels where they cross, so cars never
 * share a spot and never meet at the same level. Pure data from `(seed, plate size)`: the same network is used by the
 * traffic (`crowd.ts`), by the placement of every other object (nothing stands on a road, so a car can never drive
 * through a tree, a stone or a house) and by the road mesh (`xr/shapes/road-geometry.ts`).
 *
 * A road is an ellipse (centre, radii, rotation) walked by arc length `s`. At a crossing with an earlier road, one of
 * the two goes over (a bridge: smooth ramp up, plateau, ramp down) or under (a tunnel: it sinks below the plate and
 * disappears). Bridges and tunnels alternate, so the picture is varied.
 */
import { hashSeed, mulberry32, uniform } from './prng';
import type { WorldTemplate } from './types';

export const ROAD_HALF_WIDTH = 0.46;
export const LANE_OFFSET = 0.2;
export const BRIDGE_HEIGHT = 0.5;
/** Length of each ramp of a bridge or tunnel (rise of `BRIDGE_HEIGHT`: a gentle 15 to 20 degrees). */
export const RAMP_LENGTH = 1.9;
const SAMPLES = 256;

export type RoadKind = 'main' | 'bike';

export interface Bump {
  /** Arc length of the crossing. */
  readonly s: number;
  /** + = bridge (flyover), - = tunnel. */
  readonly height: number;
  /** Half length of the part at full height (longer for a shallow crossing) and of each ramp. */
  readonly plateau: number;
  readonly ramp: number;
}

export interface Road {
  readonly id: number;
  readonly kind: RoadKind;
  readonly cx: number;
  readonly cz: number;
  readonly rx: number;
  readonly rz: number;
  readonly rot: number;
  /** Cruising speed in plate metres per musical second; every vehicle of the road goes at it, so spacing is kept. */
  readonly speed: number;
  readonly length: number;
  readonly theta: Float64Array; // SAMPLES + 1 angles
  readonly arc: Float64Array; // cumulative arc length at each angle
  readonly px: Float64Array; // centre line samples, for distance queries
  readonly pz: Float64Array;
  bumps: Bump[];
}

export interface RoadNetwork {
  readonly roads: readonly Road[];
}

export interface RoadPoint {
  x: number;
  y: number;
  z: number;
  /** Unit tangent in the direction of increasing `s`, and the level slope dy/ds. */
  tx: number;
  tz: number;
  slope: number;
}

function ellipse(road: Road, th: number): { x: number; z: number; tx: number; tz: number } {
  const c = Math.cos(road.rot);
  const s = Math.sin(road.rot);
  const lx = road.rx * Math.cos(th);
  const lz = road.rz * Math.sin(th);
  const dx = -road.rx * Math.sin(th);
  const dz = road.rz * Math.cos(th);
  const len = Math.hypot(dx, dz) || 1;
  return {
    x: road.cx + lx * c - lz * s,
    z: road.cz + lx * s + lz * c,
    tx: (dx * c - dz * s) / len,
    tz: (dx * s + dz * c) / len,
  };
}

function makeRoad(id: number, kind: RoadKind, cx: number, cz: number, rx: number, rz: number, rot: number, speed: number): Road {
  const theta = new Float64Array(SAMPLES + 1);
  const arc = new Float64Array(SAMPLES + 1);
  const px = new Float64Array(SAMPLES + 1);
  const pz = new Float64Array(SAMPLES + 1);
  const draft = { id, kind, cx, cz, rx, rz, rot, speed, length: 0, theta, arc, px, pz, bumps: [] } as Road;
  let prev = ellipse(draft, 0);
  px[0] = prev.x;
  pz[0] = prev.z;
  for (let k = 1; k <= SAMPLES; k += 1) {
    theta[k] = (k / SAMPLES) * Math.PI * 2;
    const p = ellipse(draft, theta[k]!);
    arc[k] = arc[k - 1]! + Math.hypot(p.x - prev.x, p.z - prev.z);
    px[k] = p.x;
    pz[k] = p.z;
    prev = p;
  }
  return { ...draft, length: arc[SAMPLES]! };
}

function thetaAt(road: Road, s: number): number {
  const L = road.length;
  const u = ((s % L) + L) % L;
  let lo = 0;
  let hi = SAMPLES;
  while (hi - lo > 1) {
    const mid = (lo + hi) >> 1;
    if (road.arc[mid]! <= u) lo = mid;
    else hi = mid;
  }
  const span = road.arc[hi]! - road.arc[lo]!;
  const w = span > 0 ? (u - road.arc[lo]!) / span : 0;
  return road.theta[lo]! + (road.theta[hi]! - road.theta[lo]!) * w;
}

const smoothstep = (x: number): number => {
  const t = Math.min(1, Math.max(0, x));
  return t * t * (3 - 2 * t);
};

/** Height of the road at arc length `s`: bridges up, tunnels down, smooth ramps, zero elsewhere. */
export function levelAt(road: Road, s: number): number {
  let y = 0;
  for (const b of road.bumps) {
    let d = Math.abs(s - b.s) % road.length;
    d = Math.min(d, road.length - d);
    if (d >= b.plateau + b.ramp) continue;
    y += b.height * (d <= b.plateau ? 1 : smoothstep(1 - (d - b.plateau) / b.ramp));
  }
  return Math.max(-BRIDGE_HEIGHT, Math.min(BRIDGE_HEIGHT, y));
}

/** Centre line point of a road at arc length `s`. */
export function roadPoint(road: Road, s: number): RoadPoint {
  const p = ellipse(road, thetaAt(road, s));
  const ds = 0.05;
  return { x: p.x, z: p.z, y: levelAt(road, s), tx: p.tx, tz: p.tz, slope: (levelAt(road, s + ds) - levelAt(road, s - ds)) / (2 * ds) };
}

function segmentCross(
  ax: number, az: number, bx: number, bz: number, cx: number, cz: number, dx: number, dz: number,
): { t: number; u: number } | null {
  const rx = bx - ax;
  const rz = bz - az;
  const sx = dx - cx;
  const sz = dz - cz;
  const den = rx * sz - rz * sx;
  if (Math.abs(den) < 1e-12) return null;
  const t = ((cx - ax) * sz - (cz - az) * sx) / den;
  const u = ((cx - ax) * rz - (cz - az) * rx) / den;
  return t >= 0 && t < 1 && u >= 0 && u < 1 ? { t, u } : null;
}

const networks = new Map<string, RoadNetwork>();

/** The network of a plate; cached because the placement, the traffic and the mesh all ask for it. */
export function buildRoads(seed: number, size: number): RoadNetwork {
  const key = `${seed}:${size}`;
  const cached = networks.get(key);
  if (cached) return cached;
  const h = size / 2;
  const rng = mulberry32(hashSeed(seed, 'roads'));
  const j = (v: number, amount: number): number => v * (1 + uniform(rng, -amount, amount));
  const roads = [
    makeRoad(0, 'main', 0, 0, h * j(0.74, 0.05), h * j(0.5, 0.06), uniform(rng, -0.2, 0.2), 1.3),
    makeRoad(1, 'main', uniform(rng, -0.1, 0.1) * h, uniform(rng, -0.08, 0.08) * h, h * j(0.7, 0.04), h * j(0.34, 0.05), uniform(rng, 0.8, 1.2), 1.1),
    makeRoad(2, 'bike', uniform(rng, -0.3, -0.15) * h, uniform(rng, 0.1, 0.25) * h, h * j(0.32, 0.08), h * j(0.2, 0.08), uniform(rng, -0.6, 0.6), 0.6),
  ];
  let crossing = 0;
  const pending: { road: Road; s: number; plateau: number; sign: 1 | -1 }[] = [];
  for (let i = 0; i < roads.length; i += 1) {
    for (let k = i + 1; k < roads.length; k += 1) {
      const a = roads[i]!;
      const b = roads[k]!;
      const pa = Array.from({ length: SAMPLES + 1 }, (_, n) => ellipse(a, a.theta[n]!));
      const pb = Array.from({ length: SAMPLES + 1 }, (_, n) => ellipse(b, b.theta[n]!));
      for (let n = 0; n < SAMPLES; n += 1) {
        for (let m = 0; m < SAMPLES; m += 1) {
          const hit = segmentCross(pa[n]!.x, pa[n]!.z, pa[n + 1]!.x, pa[n + 1]!.z, pb[m]!.x, pb[m]!.z, pb[m + 1]!.x, pb[m + 1]!.z);
          if (!hit) continue;
          const sb = b.arc[m]! + (b.arc[m + 1]! - b.arc[m]!) * hit.u;
          // The later road of the pair goes over (even crossings) or under (odd crossings) the earlier one.
          const ax = pa[n + 1]!.x - pa[n]!.x;
          const az = pa[n + 1]!.z - pa[n]!.z;
          const bx = pb[m + 1]!.x - pb[m]!.x;
          const bz = pb[m + 1]!.z - pb[m]!.z;
          const sin = Math.abs(ax * bz - az * bx) / (Math.hypot(ax, az) * Math.hypot(bx, bz));
          // The crossed road is ROAD_HALF_WIDTH * 2 wide and seen at an angle: stay up long enough to clear it.
          const plateau = (ROAD_HALF_WIDTH * 2 + 0.7) / Math.max(sin, 0.2);
          pending.push({ road: b, s: sb, plateau, sign: crossing % 2 === 0 ? 1 : -1 });
          crossing += 1;
        }
      }
    }
  }
  // Crossings too close on one road are joined into one long viaduct (or one long tunnel): same sign as the previous one.
  for (const road of roads) {
    const mine = pending.filter((c) => c.road === road).sort((x, y) => x.s - y.s);
    mine.forEach((c, i) => {
      const prev = mine[(i - 1 + mine.length) % mine.length]!;
      let gap = c.s - prev.s;
      if (gap <= 0) gap += road.length;
      const sign = mine.length > 1 && gap < c.plateau + prev.plateau + 2 * RAMP_LENGTH + 0.6 ? prev.sign : c.sign;
      c.sign = sign; // later crossings see the merged sign
      road.bumps.push({ s: c.s, height: sign * BRIDGE_HEIGHT, plateau: c.plateau, ramp: RAMP_LENGTH });
    });
  }
  const network = { roads };
  networks.set(key, network);
  return network;
}

/** Does the template drive vehicles (so it needs roads)? */
export function templateHasRoads(template: WorldTemplate): boolean {
  const driving = (kind: string): boolean => kind === 'car' || kind === 'bicycle';
  const city = (template.mappings ?? []).some((m) => m.spawn === 'building'); // a city has boulevards, and its notes become cars
  if (city) return false; // a city drives on its street grid (`traffic.ts`), not on boulevards
  return template.scenery.some((s) => driving(s.kind)) || template.mappings.some((m) => driving(m.spawn));
}

/** Spatial hash of the centre line samples of a network, so a distance query looks at a few cells, not every sample. */
interface RoadGrid {
  readonly cell: number;
  readonly cells: Map<number, number[]>; // cell key -> flat [x0, z0, x1, z1, ...]
}
const grids = new WeakMap<RoadNetwork, RoadGrid>();
const GRID_CELL = 1.5;
const gridKey = (i: number, j: number): number => i * 100003 + j;

function gridOf(network: RoadNetwork): RoadGrid {
  let grid = grids.get(network);
  if (!grid) {
    const cells = new Map<number, number[]>();
    for (const road of network.roads) {
      for (let n = 0; n < SAMPLES; n += 1) {
        const key = gridKey(Math.floor(road.px[n]! / GRID_CELL), Math.floor(road.pz[n]! / GRID_CELL));
        const list = cells.get(key) ?? [];
        list.push(road.px[n]!, road.pz[n]!);
        cells.set(key, list);
      }
    }
    grid = { cell: GRID_CELL, cells };
    grids.set(network, grid);
  }
  return grid;
}

/** Distance from a point to the nearest road centre line, and that nearest point. */
export function nearestRoad(network: RoadNetwork, x: number, z: number): { dist: number; px: number; pz: number } {
  const grid = gridOf(network);
  const ci = Math.floor(x / grid.cell);
  const cj = Math.floor(z / grid.cell);
  let best = { dist: Infinity, px: 0, pz: 0 };
  // Rings of cells around the query, stopping once the next ring cannot hold a closer sample.
  for (let r = 0; r < 400; r += 1) {
    if (best.dist < (r - 1) * grid.cell) break;
    for (let i = ci - r; i <= ci + r; i += 1) {
      for (let j = cj - r; j <= cj + r; j += 1) {
        if (Math.max(Math.abs(i - ci), Math.abs(j - cj)) !== r) continue;
        const list = grid.cells.get(gridKey(i, j));
        if (!list) continue;
        for (let k = 0; k < list.length; k += 2) {
          const d = Math.hypot(x - list[k]!, z - list[k + 1]!);
          if (d < best.dist) best = { dist: d, px: list[k]!, pz: list[k + 1]! };
        }
      }
    }
  }
  return best;
}

/**
 * Moves a point out of the road corridor (road half width, a margin and the object's own radius), away from the nearest
 * road. Deterministic; used for the landing point of every fixed object.
 */
export function clearOfRoads(network: RoadNetwork, x: number, z: number, radius: number, plateHalf: number): { x: number; z: number } {
  const need = ROAD_HALF_WIDTH + 0.18 + radius;
  let px = x;
  let pz = z;
  for (let pass = 0; pass < 6; pass += 1) {
    const n = nearestRoad(network, px, pz);
    if (n.dist >= need) break;
    let dx = px - n.px;
    let dz = pz - n.pz;
    const len = Math.hypot(dx, dz);
    if (len < 1e-6) {
      dx = 1;
      dz = 0;
    } else {
      dx /= len;
      dz /= len;
    }
    px = n.px + dx * need;
    pz = n.pz + dz * need;
    const lim = plateHalf - 0.2;
    px = Math.max(-lim, Math.min(lim, px));
    pz = Math.max(-lim, Math.min(lim, pz));
  }
  return { x: px, z: pz };
}
