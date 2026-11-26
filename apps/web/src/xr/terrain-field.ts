/**
 * Terrain height field and crack network of the default look (04-default-template requirement 2). Pure functions of
 * (template, seed): no three.js, so they are cheap to unit-test. Plate frame: centred on the origin, top at y = 0,
 * x to the right, z toward the viewer, in metres.
 */
import { worldSize } from '@/engine/city';
import { zonesFor, type ZoneRect } from '@/engine/layout';
import { hashSeed, mulberry32, uniform, type Rng } from '@/engine/prng';
import type { ShapeKind, WorldTemplate } from '@/engine/types';
import {
  CRACK_CELL_SIZE,
  CRACK_DIAGONAL_RATE,
  CRACK_DROP_RATE,
  CRACK_LIFT,
  CRACK_MAX_FIELD_HEIGHT,
  CRACK_WOBBLE,
  MOUNTAIN_CLUSTER_COUNT,
  MOUNTAIN_EDGE_FADE,
  MOUNTAIN_HEIGHT,
  MOUNTAIN_INSET,
  MOUNTAIN_PEAKS,
  MOUNTAIN_RADIUS,
} from './constants';

/** One rounded, creased peak of a mountain cluster. */
export interface Peak {
  readonly x: number;
  readonly z: number;
  readonly radius: number;
  readonly height: number;
  /** Phase of the radial creases (ridges running down from the summit). */
  readonly crease: number;
}

export interface TerrainField {
  readonly half: number;
  readonly peaks: readonly Peak[];
}

const RIDGE_KIND: ShapeKind = 'terrain_ridge';
const CREASES = 5;

/** Zones where mountains must not grow: every structure zone except the ridges (which are mountains themselves). */
function blockedZones(template: WorldTemplate): ZoneRect[] {
  const kinds = new Set(template.zones.map((z) => z.kind).filter((k) => k !== RIDGE_KIND));
  return [...kinds].flatMap((k) => zonesFor(k, template));
}

function inZone(x: number, z: number, zones: readonly ZoneRect[], margin: number): boolean {
  return zones.some((r) => x > r.xMin - margin && x < r.xMax + margin && z > r.zMin - margin && z < r.zMax + margin);
}

/** Point `inset` metres inside edge `edge` (0 left, 1 right, 2 far, 3 near) at `along` ∈ [-half, half]. */
function edgePoint(edge: number, along: number, inset: number, half: number): { x: number; z: number } {
  if (edge === 0) return { x: -half + inset, z: along };
  if (edge === 1) return { x: half - inset, z: along };
  if (edge === 2) return { x: along, z: -half + inset };
  return { x: along, z: half - inset };
}

function cluster(rng: Rng, half: number, blocked: readonly ZoneRect[]): Peak[] {
  const edge = Math.floor(rng() * 4);
  const centre = edgePoint(edge, uniform(rng, -half * 0.85, half * 0.85), uniform(rng, ...MOUNTAIN_INSET), half);
  const count = MOUNTAIN_PEAKS[0] + Math.floor(rng() * (MOUNTAIN_PEAKS[1] - MOUNTAIN_PEAKS[0] + 1));
  // Clusters stretch along their edge, like the low ranges of the reference image.
  const alongX = edge >= 2;
  const peaks: Peak[] = [];
  for (let i = 0; i < count; i++) {
    const spread = uniform(rng, -1, 1) * MOUNTAIN_RADIUS[1] * 1.4;
    const across = uniform(rng, -0.25, 0.25) * MOUNTAIN_RADIUS[1];
    const x = centre.x + (alongX ? spread : across);
    const z = centre.z + (alongX ? across : spread);
    if (inZone(x, z, blocked, MOUNTAIN_RADIUS[1])) continue;
    peaks.push({
      x,
      z,
      radius: uniform(rng, ...MOUNTAIN_RADIUS),
      height: uniform(rng, ...MOUNTAIN_HEIGHT) * (i === 0 ? 1 : 0.7),
      crease: uniform(rng, 0, Math.PI * 2),
    });
  }
  return peaks;
}

/** Mountain peaks along the plate edges, outside the structure zones. Deterministic for (template, seed). */
export function buildTerrainField(template: WorldTemplate, seed: number): TerrainField {
  const half = worldSize(template) / 2;
  if (template.terrain.mountains !== 'edges') return { half, peaks: [] };
  const rng = mulberry32(hashSeed(seed, 'terrain-field'));
  const blocked = blockedZones(template);
  const peaks: Peak[] = [];
  for (let c = 0; c < MOUNTAIN_CLUSTER_COUNT; c++) peaks.push(...cluster(rng, half, blocked));
  return { half, peaks };
}

function smooth(t: number): number {
  const c = Math.min(1, Math.max(0, t));
  return c * c * (3 - 2 * c);
}

/** Height of the plate top at (x, z): 0 in the open plate, rugged peaks near the edges, 0 again at the rim. */
export function fieldHeight(field: TerrainField, x: number, z: number): number {
  let h = 0;
  for (const p of field.peaks) {
    const dx = x - p.x;
    const dz = z - p.z;
    const d2 = (dx * dx + dz * dz) / (p.radius * p.radius);
    if (d2 >= 1) continue;
    const falloff = (1 - d2) * (1 - d2);
    const creases = 0.72 + 0.28 * Math.abs(Math.sin(CREASES * Math.atan2(dz, dx) + p.crease));
    h = Math.max(h, p.height * falloff * (d2 < 0.02 ? 1 : creases));
  }
  const rim = Math.min(field.half - Math.abs(x), field.half - Math.abs(z));
  return h * smooth(rim / MOUNTAIN_EDGE_FADE);
}

/**
 * Dried-mud crack network: a jittered grid of crack vertices; grid edges (some dropped, some diagonals added) are
 * drawn as two-segment wobbly polylines. Returns line-segment pairs (x, y, z) at `CRACK_LIFT` above the plate, skipping
 * edges that climb onto mountains.
 */
export function crackNetwork(field: TerrainField, seed: number): Float32Array {
  const rng = mulberry32(hashSeed(seed, 'cracks'));
  const half = field.half;
  const n = Math.max(2, Math.round((2 * half) / CRACK_CELL_SIZE));
  const cell = (2 * half) / n;
  const jitter = cell * 0.35;
  const vx: number[] = [];
  const vz: number[] = [];
  for (let j = 0; j <= n; j++) {
    for (let i = 0; i <= n; i++) {
      const border = i === 0 || j === 0 || i === n || j === n;
      vx.push(-half + i * cell + (border ? 0 : uniform(rng, -jitter, jitter)));
      vz.push(-half + j * cell + (border ? 0 : uniform(rng, -jitter, jitter)));
    }
  }
  const at = (i: number, j: number) => j * (n + 1) + i;
  const out: number[] = [];
  const edge = (a: number, b: number) => {
    const mx = (vx[a]! + vx[b]!) / 2 + uniform(rng, -CRACK_WOBBLE, CRACK_WOBBLE) * cell;
    const mz = (vz[a]! + vz[b]!) / 2 + uniform(rng, -CRACK_WOBBLE, CRACK_WOBBLE) * cell;
    if (fieldHeight(field, mx, mz) > CRACK_MAX_FIELD_HEIGHT) return;
    out.push(vx[a]!, CRACK_LIFT, vz[a]!, mx, CRACK_LIFT, mz, mx, CRACK_LIFT, mz, vx[b]!, CRACK_LIFT, vz[b]!);
  };
  for (let j = 0; j <= n; j++) {
    for (let i = 0; i <= n; i++) {
      const inner = j > 0 && j < n;
      const innerX = i > 0 && i < n;
      if (i < n && inner && rng() >= CRACK_DROP_RATE) edge(at(i, j), at(i + 1, j));
      if (j < n && innerX && rng() >= CRACK_DROP_RATE) edge(at(i, j), at(i, j + 1));
      if (i < n && j < n && rng() < CRACK_DIAGONAL_RATE) {
        if (rng() < 0.5) edge(at(i, j), at(i + 1, j + 1));
        else edge(at(i + 1, j), at(i, j + 1));
      }
    }
  }
  return new Float32Array(out);
}
