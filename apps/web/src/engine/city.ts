/**
 * City plan (I39): a complete town laid over the whole plate, as pure data from `(seed, plate size)`. Streets form a
 * grid; the ring boulevards of `roads.ts` cross it; lakes sit in some blocks, with bridges where a street crosses one;
 * every block is cut into lots (houses, shops, apartments, towers, skyscrapers by district) and gardens (trees and
 * bushes), parks fill a few blocks; traffic lights stand at the street crossings.
 *
 * The city is built by the music: lots and gardens are ranked from the centre outwards (with a ragged edge), and the
 * k-th note of a class takes the lot at its share of the ranking, so the town spreads over the whole plate as the song
 * goes on. `cityFront` gives the radius reached at a time; streets, lakes and lights appear inside it.
 */
import { PLATE_INSET } from './constants';
import { hashSeed, mulberry32, uniform } from './prng';
import { buildRoads, nearestRoad, ROAD_HALF_WIDTH, templateHasRoads, type RoadNetwork } from './roads';
import type { ShapeKind, WorldTemplate } from './types';

export const STREET_HALF = 0.15;
export const SIDEWALK = 0.1;
/** Target distance between two streets (plate metres); the real pitch divides the plate into whole blocks. */
const BLOCK_PITCH = 2.1;
const CELLS = 4; // lots per block side
/** Share of the cells of a district that hold a building. */
const BUILT_SHARE: Readonly<Record<'core' | 'mid' | 'edge', number>> = { core: 0.7, mid: 0.4, edge: 0.2 };
/** Houses, shops and so on, in the order of `BUILDING_VARIANT_*`. */
export const BUILDING_VARIANTS = ['tower', 'house', 'apartment', 'shop', 'skyscraper'] as const;
export type BuildingVariant = (typeof BUILDING_VARIANTS)[number];
/** Footprint (plate metres) and height factor (× the note height) of each variant. */
export const BUILDING_VARIANT_FOOTPRINT: readonly number[] = [0.32, 0.38, 0.4, 0.4, 0.34];
export const BUILDING_VARIANT_HEIGHT: readonly number[] = [1, 0.4, 0.7, 0.35, 1.5];
/** A building takes at least this long to be built, however short the note (seconds). */
export const CONSTRUCTION_SEC = 3;

export type District = 'core' | 'mid' | 'edge';

export interface Lot {
  readonly x: number;
  readonly z: number;
  /** Rotation about the vertical axis: 0 = long side along x. */
  readonly yaw: number;
  readonly district: District;
  readonly variant: number;
  /** Ranking key (distance from the centre with a ragged edge): low = built first. */
  readonly key: number;
}

export interface Garden {
  readonly x: number;
  readonly z: number;
  readonly key: number;
}

export interface Street {
  readonly axis: 'x' | 'z'; // 'x': runs along x, at `at` on z
  readonly at: number;
}

export interface Block {
  readonly x0: number;
  readonly x1: number;
  readonly z0: number;
  readonly z1: number;
  readonly park: boolean;
}

export interface Lake {
  readonly cx: number;
  readonly cz: number;
  readonly rx: number;
  readonly rz: number;
  readonly rot: number;
}

export interface Bridge {
  readonly axis: 'x' | 'z';
  readonly at: number;
  readonly from: number;
  readonly to: number;
}

export interface TrafficLight {
  readonly x: number;
  readonly z: number;
  /** Which street it governs: 0 = along x, 1 = along z. */
  readonly axis: 0 | 1;
  /** Yaw of the head: it looks toward the middle of its crossing. */
  readonly facing: number;
  readonly key: number;
}

export interface City {
  readonly half: number;
  readonly streets: readonly Street[];
  readonly blocks: readonly Block[];
  readonly lakes: readonly Lake[];
  readonly bridges: readonly Bridge[];
  readonly lots: readonly Lot[]; // sorted by key
  readonly gardens: readonly Garden[]; // sorted by key
  /** Spots of the big things (needles, hills) in the parks, sorted by key. */
  readonly monuments: readonly Garden[];
  readonly lights: readonly TrafficLight[];
  /** Radius of the furthest thing, plate metres. */
  readonly maxRadius: number;
}

/** Does the template want a city: notes make buildings (Neon Nocturne, Living City). */
export function templateHasCity(template: WorldTemplate): boolean {
  return (template.mappings ?? []).some((m) => m.spawn === 'building');
}

/** A city fills a world this many times wider than the template's plate: the plate no longer limits the world. */
export const CITY_SPAN = 4;
/** Largest world of a city, in plate metres. */
export const CITY_MAX_SIZE = 64;

/** How many times wider than its plate the world of a template is (1, or `CITY_SPAN` for a city). */
export function worldSpan(template: WorldTemplate): number {
  // Capped: the plan has thousands of spots per 10 000 square units, so a template with a big plate is not widened as much.
  return templateHasCity(template) ? Math.max(1, Math.min(CITY_SPAN, CITY_MAX_SIZE / Math.max(1, template.terrain.size))) : 1;
}

/** Side of the area the music fills, in plate metres: everything is placed, drawn and walked inside it. */
export function worldSize(template: WorldTemplate): number {
  return template.terrain.size * worldSpan(template);
}

/** The city of a world: with the ring boulevards when the template drives vehicles. */
export function cityOf(template: WorldTemplate, seed: number): City {
  return buildCity(seed, worldSize(template), templateHasRoads(template));
}

/** Big things that stand in the parks: equalizer needles, hills, crystals. */
const MONUMENT_KINDS: ReadonlySet<string> = new Set(['spike', 'terrain_ridge', 'crystal', 'cluster']);

export function isCityKind(kind: ShapeKind): 'building' | 'garden' | 'monument' | null {
  if (kind === 'building') return 'building';
  if (MONUMENT_KINDS.has(kind)) return 'monument';
  return kind === 'tree' || kind === 'conifer' || kind === 'bush' ? 'garden' : null;
}

/** Position `(x, z)` relative to a lake as 0 (centre) … 1 (shore); > 1 is dry land. */
export function lakeLevel(lake: Lake, x: number, z: number, margin = 0): number {
  const c = Math.cos(lake.rot);
  const s = Math.sin(lake.rot);
  const dx = x - lake.cx;
  const dz = z - lake.cz;
  const u = (dx * c + dz * s) / (lake.rx + margin);
  const v = (-dx * s + dz * c) / (lake.rz + margin);
  return Math.hypot(u, v);
}

export function inLake(city: Pick<City, 'lakes'>, x: number, z: number, margin = 0): boolean {
  return city.lakes.some((l) => lakeLevel(l, x, z, margin) < 1);
}

const cache = new Map<string, City>();

export function buildCity(seed: number, size: number, rings = true): City {
  const key = `${seed}:${size}:${rings}`;
  const cached = cache.get(key);
  if (cached) return cached;
  const half = (size / 2) * PLATE_INSET;
  const rng = mulberry32(hashSeed(seed, 'city'));
  const roads: RoadNetwork | null = rings ? buildRoads(seed, size) : null;
  const roadDist = (x: number, z: number): number => (roads ? nearestRoad(roads, x, z).dist : Infinity);
  const cellsPerSide = Math.max(2, Math.round((2 * half) / BLOCK_PITCH));
  const edge = half - STREET_HALF - 0.04;
  const pitch = (2 * edge) / cellsPerSide;
  const lines = Array.from({ length: cellsPerSide + 1 }, (_, i) => -edge + i * pitch);
  const streets: Street[] = lines.flatMap((at) => [{ axis: 'x' as const, at }, { axis: 'z' as const, at }]);

  // Lakes: in dry spots clear of the boulevards, away from the very centre.
  const lakes: Lake[] = [];
  const wanted = 2 + Math.floor(rng() * 2);
  for (let attempt = 0; attempt < 120 && lakes.length < wanted; attempt += 1) {
    const rx = uniform(rng, 0.8, 1.35);
    const rz = rx * uniform(rng, 0.55, 0.85);
    const cx = uniform(rng, -half + rx + 0.5, half - rx - 0.5);
    const cz = uniform(rng, -half + rx + 0.5, half - rx - 0.5);
    if (Math.hypot(cx, cz) < half * 0.3) continue;
    const lake: Lake = { cx, cz, rx, rz, rot: uniform(rng, -0.6, 0.6) };
    const clear = roadDist(cx, cz) > ROAD_HALF_WIDTH + rx + 0.3;
    const apart = lakes.every((o) => Math.hypot(o.cx - cx, o.cz - cz) > o.rx + rx + 0.8);
    if (clear && apart) lakes.push(lake);
  }

  const bridges: Bridge[] = [];
  for (const street of streets) {
    let from: number | null = null;
    const step = 0.04;
    for (let u = -half; u <= half + step; u += step) {
      const x = street.axis === 'x' ? u : street.at;
      const z = street.axis === 'x' ? street.at : u;
      const wet = lakes.some((l) => lakeLevel(l, x, z, 0.08) < 1);
      if (wet && from === null) from = u;
      if ((!wet || u > half) && from !== null) {
        bridges.push({ axis: street.axis, at: street.at, from: from - 0.1, to: u + 0.1 });
        from = null;
      }
    }
  }

  const blocks: Block[] = [];
  const lots: Lot[] = [];
  const gardens: Garden[] = [];
  const reach = Math.hypot(half, half);
  const blockRng = mulberry32(hashSeed(seed, 'city-blocks'));
  const inner = STREET_HALF + SIDEWALK;
  for (let i = 0; i < cellsPerSide; i += 1) {
    for (let j = 0; j < cellsPerSide; j += 1) {
      const x0 = lines[i]!;
      const x1 = lines[i + 1]!;
      const z0 = lines[j]!;
      const z1 = lines[j + 1]!;
      const mx = (x0 + x1) / 2;
      const mz = (z0 + z1) / 2;
      const far = Math.hypot(mx, mz) / reach;
      const park = far > 0.12 && blockRng() < 0.16;
      blocks.push({ x0, x1, z0, z1, park });
      const w = (x1 - x0 - 2 * inner) / CELLS;
      const d = (z1 - z0 - 2 * inner) / CELLS;
      for (let a = 0; a < CELLS; a += 1) {
        for (let b = 0; b < CELLS; b += 1) {
          const x = x0 + inner + (a + 0.5) * w;
          const z = z0 + inner + (b + 0.5) * d;
          if (lakes.some((l) => lakeLevel(l, x, z, 0.35) < 1)) continue;
          if (roadDist(x, z) < ROAD_HALF_WIDTH + 0.08 + 0.2) continue;
          const r = Math.hypot(x, z) / reach;
          const district: District = r < 0.26 ? 'core' : r < 0.58 ? 'mid' : 'edge';
          const cellRng = mulberry32(hashSeed(seed, `cell:${i}:${j}:${a}:${b}`));
          const ragged = r * reach * (0.8 + 0.4 * cellRng());
          // Not every cell is built: dense in the core, scattered at the edge; the rest is garden or open yard.
          const built = !park && cellRng() < BUILT_SHARE[district];
          const garden = park || (!built && cellRng() < 0.55);
          if (!built && !garden) continue;
          if (garden) {
            const spots = park ? 2 : 1;
            for (let k = 0; k < spots; k += 1) {
              gardens.push({ x: x + (cellRng() - 0.5) * w * 0.5, z: z + (cellRng() - 0.5) * d * 0.5, key: ragged + k * 0.01 });
            }
            continue;
          }
          const facesX = a === 0 || a === CELLS - 1;
          const facesZ = b === 0 || b === CELLS - 1;
          const faceX = facesX && (!facesZ || cellRng() < 0.5);
          lots.push({ x, z, yaw: faceX ? Math.PI / 2 : 0, district, variant: pickVariant(district, cellRng()), key: ragged });
        }
      }
    }
  }
  lots.sort((p, q) => p.key - q.key);
  gardens.sort((p, q) => p.key - q.key);
  const monuments: Garden[] = [];
  blocks.forEach((block, n) => {
    if (!block.park) return;
    const mx = (block.x0 + block.x1) / 2;
    const mz = (block.z0 + block.z1) / 2;
    if (lakes.some((l) => lakeLevel(l, mx, mz, 0.6) < 1) || roadDist(mx, mz) < ROAD_HALF_WIDTH + 0.5) return;
    const spread = (block.x1 - block.x0) * 0.2;
    for (const [dx, dz] of [[-1, -1], [1, 1], [-1, 1], [1, -1]] as const) {
      monuments.push({ x: mx + dx * spread, z: mz + dz * spread, key: Math.hypot(mx, mz) + n * 1e-4 });
    }
  });
  monuments.sort((p, q) => p.key - q.key);

  const lights: TrafficLight[] = [];
  const off = STREET_HALF + SIDEWALK * 0.5;
  for (const sx of lines) {
    for (const sz of lines) {
      if (inLake({ lakes }, sx, sz, 0.3)) continue;
      if (roadDist(sx, sz) < ROAD_HALF_WIDTH + 0.2) continue;
      for (const cx of [-1, 1] as const) {
        for (const cz of [-1, 1] as const) {
          const x = sx + cx * off;
          const z = sz + cz * off;
          if (Math.abs(x) > half || Math.abs(z) > half) continue;
          lights.push({ x, z, axis: cx * cz > 0 ? 0 : 1, facing: Math.atan2(-cx, -cz), key: Math.hypot(x, z) });
        }
      }
    }
  }

  const city: City = { half, streets, blocks, lakes, bridges, lots, gardens, monuments, lights, maxRadius: reach };
  cache.set(key, city);
  return city;
}

function pickVariant(district: District, u: number): number {
  const table: Readonly<Record<District, readonly [number, number][]>> = {
    core: [[0, 0.45], [4, 0.8], [2, 1]],
    mid: [[2, 0.35], [3, 0.6], [0, 0.7], [1, 1]],
    edge: [[1, 0.65], [3, 0.85], [2, 1]],
  };
  return table[district].find(([, upTo]) => u <= upTo)![0];
}

/**
 * The spot of the k-th item of a class (`total` items in all) in a ranked pool: the ranking is spread over the items,
 * so the whole town is covered whatever the song; when there are more items than spots the spots are reused.
 */
export function rankedSpot<T>(pool: readonly T[], ordinal: number, total: number): T | null {
  if (pool.length === 0) return null;
  const n = pool.length;
  const index = total <= n ? Math.floor(((ordinal + 0.5) * n) / Math.max(1, total)) : ordinal % n;
  return pool[Math.min(n - 1, index)]!;
}

/** Radius of the part of the town that exists at time `t`: it leads the buildings a little and covers everything by the end. */
export function cityFront(city: Pick<City, 'maxRadius'>, t: number, durationSec: number): number {
  const p = Math.min(1, Math.max(0, t / Math.max(1, durationSec * 0.85)));
  return city.maxRadius * Math.min(1.05, 0.08 + 1.0 * Math.sqrt(p));
}

/** Colors of a traffic light: 0 red, 1 yellow, 2 green. `beat` is the position in beats; the cycle lasts 8 beats. */
export function lightColor(axis: 0 | 1, beat: number): 0 | 1 | 2 {
  const c = ((beat % 8) + 8) % 8;
  const mine = axis === 0 ? c : (c + 4) % 8;
  return mine < 3.4 ? 2 : mine < 4 ? 1 : 0;
}

/** Position `t` in beats from the sorted beat times (extrapolated at the ends; seconds when there is no grid). */
export function beatPosition(beats: readonly number[], t: number): number {
  const n = beats.length;
  if (n < 2) return t * 2;
  let lo = 0;
  let hi = n - 1;
  if (t <= beats[0]!) return (t - beats[0]!) / (beats[1]! - beats[0]!);
  if (t >= beats[hi]!) return hi + (t - beats[hi]!) / (beats[hi]! - beats[hi - 1]!);
  while (hi - lo > 1) {
    const mid = (lo + hi) >> 1;
    if (beats[mid]! <= t) lo = mid;
    else hi = mid;
  }
  return lo + (t - beats[lo]!) / (beats[hi]! - beats[lo]!);
}
