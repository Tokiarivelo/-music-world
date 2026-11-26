import { NEON_NOCTURNE } from '@/templates/default';
import type { Template } from '@/templates/generated';

/** Pure, immutable model of a user map: a template plus hand-placed objects (`layout.placed`). No React, no I/O. */

export type PlacedObject = NonNullable<Template['layout']>['placed'][number];
export type Layout = NonNullable<Template['layout']>;
export type MapEnvironment = 'city' | 'meadow' | 'underwater';
type Kind = PlacedObject['kind'];

export const MAX_PLACED = 400;
export const COORD_LIMIT = 64;
export const SCALE_RANGE = { min: 0.2, max: 5 } as const;
export const PLATE_RANGE = { min: 4, max: 40 } as const;
export const SEED_MAX = 2_147_483_647;
export const DEFAULT_GRID_M = 1;
const NAME_MAX = 60;

const ENVIRONMENT_KIND: Readonly<Record<MapEnvironment, Kind>> = { city: 'building', meadow: 'tree', underwater: 'bush' };

export interface NewMapOptions {
  readonly name: string;
  /** A stock template to start from (its recipes, palette, mappings and look are kept); null: an empty plate. */
  readonly from: Template | null;
  /** Used by an empty plate only. */
  readonly environment: MapEnvironment;
  readonly plateSize: number;
  readonly seed: number;
}

export function clamp(v: number, min: number, max: number): number {
  return Number.isFinite(v) ? Math.min(max, Math.max(min, v)) : min;
}

export function snapTo(value: number, grid: number): number {
  return grid > 0 ? Math.round(value / grid) * grid : value;
}

function wrapYaw(deg: number): number {
  if (!Number.isFinite(deg)) return 0;
  const wrapped = ((((deg + 180) % 360) + 360) % 360) - 180;
  return wrapped === -180 && deg > 0 ? 180 : wrapped;
}

export function slugify(raw: string): string {
  const slug = raw.toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '').replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '');
  return slug.slice(0, 40).replace(/-+$/, '') || 'map';
}

export function emptyLayout(seed: number | null = null): Layout {
  return { inventory: [], patches: [], sequence: [], placed: [], seed };
}

/** A new map: an empty plate of the chosen environment, or a copy of a stock template, with no placed object yet. */
export function createMap(options: NewMapOptions): Template {
  const name = options.name.trim().slice(0, NAME_MAX) || 'My map';
  const seed = Math.round(clamp(options.seed, 0, SEED_MAX));
  const size = clamp(options.plateSize, PLATE_RANGE.min, PLATE_RANGE.max);
  const id = `${slugify(name)}-${seed}`.slice(0, 60);
  if (options.from) {
    const base = structuredClone(options.from);
    return { ...base, id, name, meta: null, layout: { ...(base.layout ?? emptyLayout()), placed: [], seed } };
  }
  const base = structuredClone(NEON_NOCTURNE);
  return {
    ...base,
    id,
    name,
    meta: null,
    terrain: { ...base.terrain, size },
    fx: { ...base.fx, environment: options.environment === 'underwater' ? 'underwater' : 'land' },
    mappings: [{ when: { pitch: null, chord: null, stem: null, line: null, velocity: null }, spawn: ENVIRONMENT_KIND[options.environment], heightFrom: 'velocity', colorRole: null }],
    scenery: [],
    zones: [],
    recipes: [],
    layout: emptyLayout(seed),
  };
}

export function placedOf(template: Template): readonly PlacedObject[] {
  return template.layout?.placed ?? [];
}

function withPlaced(template: Template, placed: PlacedObject[]): Template {
  return { ...template, layout: { ...(template.layout ?? emptyLayout()), placed } };
}

function freshId(taken: ReadonlySet<string>): string {
  for (let n = taken.size + 1; ; n += 1) {
    const id = `o${n}`;
    if (!taken.has(id)) return id;
  }
}

export interface PlaceOptions {
  readonly y?: number;
  readonly yaw?: number;
  readonly scale?: number;
  readonly variant?: number;
  readonly color?: string | null;
  /** Grid size in metres to snap x and z to (cities: the street grid); 0 or absent: no snapping. */
  readonly snap?: number;
}

export function normalizePlaced(o: PlacedObject): PlacedObject {
  return {
    ...o,
    x: clamp(o.x, -COORD_LIMIT, COORD_LIMIT),
    y: clamp(o.y, -2, 20),
    z: clamp(o.z, -COORD_LIMIT, COORD_LIMIT),
    yaw: wrapYaw(o.yaw),
    scale: clamp(o.scale, SCALE_RANGE.min, SCALE_RANGE.max),
    variant: Math.round(clamp(o.variant, 0, 15)),
  };
}

/** Puts an object on the ground at (x, z). Unchanged (id null) when the map is full or a recipe kind is unknown. */
export function placeObject(template: Template, kind: Kind, x: number, z: number, options: PlaceOptions = {}): { template: Template; id: string | null } {
  const placed = placedOf(template);
  if (placed.length >= MAX_PLACED) return { template, id: null };
  if (kind.startsWith('recipe:') && !template.recipes.some((r) => `recipe:${r.name}` === kind)) return { template, id: null };
  const grid = options.snap ?? 0;
  const id = freshId(new Set(placed.map((p) => p.id)));
  const object = normalizePlaced({
    id,
    kind,
    x: snapTo(x, grid),
    y: options.y ?? 0,
    z: snapTo(z, grid),
    yaw: options.yaw ?? 0,
    scale: options.scale ?? 1,
    variant: options.variant ?? 0,
    color: options.color ?? null,
  });
  return { template: withPlaced(template, [...placed, object]), id };
}

export function updatePlaced(template: Template, id: string, change: Partial<Omit<PlacedObject, 'id'>>): Template {
  const placed = placedOf(template);
  if (!placed.some((p) => p.id === id)) return template;
  return withPlaced(template, placed.map((p) => (p.id === id ? normalizePlaced({ ...p, ...change }) : p)));
}

export function movePlaced(template: Template, id: string, x: number, z: number, snap = 0): Template {
  return updatePlaced(template, id, { x: snapTo(x, snap), z: snapTo(z, snap) });
}

export function removePlaced(template: Template, ids: readonly string[]): Template {
  const gone = new Set(ids);
  const placed = placedOf(template);
  return placed.some((p) => gone.has(p.id)) ? withPlaced(template, placed.filter((p) => !gone.has(p.id))) : template;
}

/** Copies the objects, shifted by (dx, dz); stops at the map limit. Returns the new ids. */
export function copyPlaced(template: Template, ids: readonly string[], dx: number, dz: number): { template: Template; ids: string[] } {
  const wanted = new Set(ids);
  const source = placedOf(template).filter((p) => wanted.has(p.id));
  const all = [...placedOf(template)];
  const taken = new Set(all.map((p) => p.id));
  const added: string[] = [];
  for (const p of source) {
    if (all.length >= MAX_PLACED) break;
    const id = freshId(taken);
    taken.add(id);
    all.push(normalizePlaced({ ...p, id, x: p.x + dx, z: p.z + dz }));
    added.push(id);
  }
  return added.length === 0 ? { template, ids: [] } : { template: withPlaced(template, all), ids: added };
}

/** `count` extra copies of one object in a line, each (dx, dz) further than the last. */
export function arrayPlaced(template: Template, id: string, count: number, dx: number, dz: number): { template: Template; ids: string[] } {
  const source = placedOf(template).find((p) => p.id === id);
  if (!source) return { template, ids: [] };
  let current = template;
  const ids: string[] = [];
  const n = Math.max(0, Math.min(MAX_PLACED, Math.floor(Number.isFinite(count) ? count : 0)));
  for (let i = 1; i <= n; i += 1) {
    const copy = copyPlaced(current, [id], dx * i, dz * i);
    if (copy.ids.length === 0) break;
    current = copy.template;
    ids.push(...copy.ids);
  }
  return { template: current, ids };
}

/** Another kind (or variant) for the objects; a recipe kind must exist in the template. */
export function replaceKind(template: Template, ids: readonly string[], kind: Kind, variant?: number): Template {
  if (kind.startsWith('recipe:') && !template.recipes.some((r) => `recipe:${r.name}` === kind)) return template;
  const set = new Set(ids);
  const placed = placedOf(template);
  if (!placed.some((p) => set.has(p.id))) return template;
  return withPlaced(template, placed.map((p) => (set.has(p.id) ? normalizePlaced({ ...p, kind, variant: variant ?? p.variant }) : p)));
}

/** Ids of the objects whose ground position is inside the rectangle (any two opposite corners). */
export function placedInBox(template: Template, x0: number, z0: number, x1: number, z1: number): string[] {
  const [xa, xb] = [Math.min(x0, x1), Math.max(x0, x1)];
  const [za, zb] = [Math.min(z0, z1), Math.max(z0, z1)];
  return placedOf(template).filter((p) => p.x >= xa && p.x <= xb && p.z >= za && p.z <= zb).map((p) => p.id);
}

/** Nearest object to a ground point within `radius` metres, for click selection; null when none. */
export function pickPlaced(template: Template, x: number, z: number, radius = 1): string | null {
  let best: { id: string; d: number } | null = null;
  for (const p of placedOf(template)) {
    const d = Math.hypot(p.x - x, p.z - z);
    if (d <= radius && (best === null || d < best.d)) best = { id: p.id, d };
  }
  return best?.id ?? null;
}
