/**
 * World plans (I40). A template has an inventory: every kind of object it can put in the world, each with a role.
 * The plan of the world is generated from that inventory, so a plan only ever uses objects the template has:
 *
 *  - `city`: streets, lots, gardens, roads (see `city.ts`), for templates that have buildings;
 *  - `reef`: an underwater world: forests of kelp, coral gardens, sandy flats and a wreck, laid out over the seabed
 *    (this file), with the swimmers of the template roaming above them.
 *
 * Pure functions of (template, seed): same input, same plan. LLM output stays data: the plan only reads kind names.
 */
import { noteStream, hashSeed, mulberry32 } from './prng';
import { BENTHIC_THEME, type ReefTheme } from './benthic';
import { buildingVariantOfRecipe, templateHasCity } from './city';
import { worldSize } from './city';
import type { ShapeKind, Vec3, WorldTemplate } from './types';

export type ObjectRole = 'building' | 'flora' | 'vehicle' | 'sky' | 'landmark' | 'terrain' | 'benthic' | 'swimmer' | 'giant' | 'effect' | 'other';

export interface InventoryItem {
  readonly kind: ShapeKind;
  readonly role: ObjectRole;
}

/** Kinds the plan places once or rarely (one castle, a few dragons, one wreck): weight when picking a kind for a note. */
const PICK_WEIGHT: Readonly<Record<string, number>> = { 'recipe:shipwreck': 0, 'recipe:castle': 0, 'recipe:dragon': 0.12, 'recipe:wizard_tower': 0.5 };
const GIANTS: ReadonlySet<string> = new Set(['recipe:whale', 'recipe:shark']);
const EFFECTS: ReadonlySet<string> = new Set(['recipe:bubble_column']);
const SWIMMER_NAMES: ReadonlySet<string> = new Set([
  'recipe:dolphin', 'recipe:manta_ray', 'recipe:sea_turtle', 'recipe:jellyfish', 'recipe:octopus', 'recipe:seahorse',
  'recipe:clownfish', 'recipe:fish_school', 'recipe:pufferfish',
]);
const BUILTIN_ROLE: Readonly<Record<string, ObjectRole>> = {
  building: 'building', tree: 'flora', conifer: 'flora', bush: 'flora', car: 'vehicle', bicycle: 'vehicle',
  cloud: 'sky', airplane: 'sky', spike: 'landmark', terrain_ridge: 'terrain',
};

export function roleOf(kind: ShapeKind): ObjectRole {
  if (kind in BUILTIN_ROLE) return BUILTIN_ROLE[kind]!;
  if (kind in BENTHIC_THEME) return 'benthic';
  if (GIANTS.has(kind)) return 'giant';
  if (EFFECTS.has(kind)) return 'effect';
  if (SWIMMER_NAMES.has(kind)) return 'swimmer';
  return 'other';
}

/** Every kind the template can put in the world (its mappings, its scenery and its recipes), once each. */
export function inventoryOf(template: WorldTemplate): InventoryItem[] {
  const kinds = new Set<ShapeKind>();
  for (const m of template.mappings ?? []) kinds.add(m.spawn);
  for (const s of template.scenery ?? []) kinds.add(s.kind);
  // A `building_<variant>` recipe restyles the city's own building variant: it is not an object to spawn.
  for (const r of template.recipes ?? []) if (buildingVariantOfRecipe(r.name) === null) kinds.add(`recipe:${r.name}`);
  return [...kinds].map((kind) => ({ kind, role: roleOf(kind) }));
}

export type WorldPlanKind = 'city' | 'reef' | 'realm' | 'open';

export function worldPlanKind(template: WorldTemplate): WorldPlanKind {
  if (templateHasCity(template)) return 'city';
  const grounded = inventoryOf(template).filter((i) => i.role === 'benthic');
  if (grounded.length === 0) return 'open';
  return template.fx.environment === 'underwater' ? 'reef' : 'realm';
}

// ---------------------------------------------------------------------------------------------------- reef plan

export type { ReefTheme };

export interface ReefPatch {
  readonly theme: ReefTheme;
  readonly x: number;
  readonly z: number;
  readonly radius: number;
  /** Kinds of the inventory that grow in this patch. */
  readonly kinds: readonly ShapeKind[];
}

export interface Reef {
  readonly patches: readonly ReefPatch[];
}

/** Patches per theme, from the centre outwards: the music grows the reef from its middle to its edges. */
const PATCH_COUNT: Readonly<Record<ReefTheme, number>> = { keep: 1, village: 3, forest: 4, crystal: 3, kelp: 3, coral: 4, sand: 2, wreck: 1 };
const reefCache = new Map<string, Reef>();

type Layout = NonNullable<WorldTemplate['layout']>;

/** The layout the director wrote for this template (I41), when it is usable: patches, and steps that use them. */
export function layoutOf(template: WorldTemplate): Layout | null {
  const layout = template.layout;
  if (!layout || layout.sequence.length === 0) return null;
  return layout;
}

function reefFromLayout(layout: Layout, size: number): Reef {
  const half = size / 2;
  const patches = layout.patches.map((p): ReefPatch => ({
    theme: p.theme,
    x: p.x * half * 0.96,
    z: p.z * half * 0.96,
    radius: p.radius * half,
    kinds: [...new Set(layout.sequence.filter((s) => s.patch === p.id).map((s) => s.kind))],
  }));
  // Filled from the centre outwards, like the derived plan.
  patches.sort((a, b) => Math.hypot(a.x, a.z) - Math.hypot(b.x, b.z));
  return { patches };
}

export function reefOf(template: WorldTemplate, seed: number): Reef {
  const size = worldSize(template);
  const layout = layoutOf(template);
  if (layout && layout.patches.length > 0) return reefFromLayout(layout, size);
  const items = inventoryOf(template).filter((i) => i.role === 'benthic');
  const key = `${seed}:${size}:${items.map((i) => i.kind).join(',')}`;
  const cached = reefCache.get(key);
  if (cached) return cached;
  const themes = (Object.keys(PATCH_COUNT) as ReefTheme[]).filter((t) => items.some((i) => BENTHIC_THEME[i.kind] === t));
  const rng = mulberry32(hashSeed(seed, 'reef'));
  const half = size / 2;
  const patches: ReefPatch[] = [];
  const wanted = themes.flatMap((theme) => Array.from({ length: PATCH_COUNT[theme] }, () => theme));
  // Jittered golden-angle spiral: patches spread over the plate without overlapping, the first ones near the centre.
  let n = 0;
  for (const theme of wanted) {
    const radius = half * (theme === 'wreck' ? 0.16 : 0.17 + rng() * 0.07);
    for (let tries = 0; tries < 40; tries += 1) {
      const a = (n + tries * 0.37) * 2.399963 + rng() * 0.6;
      const d = half * (0.18 + 0.62 * Math.sqrt((n + 0.5 + tries * 0.15) / (wanted.length + 1)));
      const x = Math.cos(a) * d;
      const z = Math.sin(a) * d;
      const ok = Math.hypot(x, z) + radius < half * 0.96 && patches.every((p) => Math.hypot(p.x - x, p.z - z) > (p.radius + radius) * 0.85);
      if (ok || tries === 39) {
        patches.push({ theme, x, z, radius, kinds: items.filter((i) => BENTHIC_THEME[i.kind] === theme).map((i) => i.kind) });
        break;
      }
    }
    n += 1;
  }
  const keep = patches.find((p) => p.theme === 'keep'); // the heart of the realm: its castle stands at the centre
  if (keep) Object.assign(keep, { x: 0, z: 0 });
  patches.sort((a, b) => Math.hypot(a.x, a.z) - Math.hypot(b.x, b.z));
  const reef = { patches };
  reefCache.set(key, reef);
  return reef;
}

export function themeOf(kind: ShapeKind): ReefTheme | null {
  return BENTHIC_THEME[kind] ?? null;
}

/**
 * Where the `ordinal`-th object of a theme grows (of `total` of that theme): the patches of the theme in order from the
 * centre, each filled one after the other, inside the patch with a dense core and a ragged edge.
 */
export function reefSpot(reef: Reef, kind: ShapeKind, ordinal: number, total: number, seed: number, noteId: string): Vec3 | null {
  const theme = themeOf(kind);
  const byKind = reef.patches.filter((p) => p.kinds.includes(kind));
  const mine = byKind.length > 0 ? byKind : reef.patches.filter((p) => p.theme === theme);
  if (!theme || mine.length === 0) return null;
  const per = Math.max(1, Math.ceil(Math.max(1, total) / mine.length));
  const patch = mine[Math.min(mine.length - 1, Math.floor(ordinal / per))]!;
  const rng = noteStream(seed, `${noteId}:reef`);
  if (theme === 'keep' && kind === 'recipe:castle') return { x: patch.x, y: 0, z: patch.z }; // the castle stands at the heart of its keep
  const a = rng() * Math.PI * 2;
  const d = patch.radius * Math.sqrt(rng()) * (0.35 + 0.65 * rng());
  return { x: patch.x + Math.cos(a) * d, y: 0, z: patch.z + Math.sin(a) * d };
}

const rotations = new WeakMap<object, readonly ShapeKind[]>();

/**
 * The order in which the notes pick objects: the steps of the director's sequence, each repeated in proportion to its
 * weight and spread out evenly (smooth weighted round robin), so a rare object comes back at regular intervals.
 */
export function rotationOf(template: WorldTemplate): readonly ShapeKind[] | null {
  const layout = layoutOf(template);
  if (!layout) return null;
  const cached = rotations.get(layout);
  if (cached) return cached.length > 0 ? cached : null;
  const steps = layout.sequence.filter((s) => s.weight > 0);
  const slots = steps.map((s) => Math.max(1, Math.round(s.weight * 2)));
  const total = slots.reduce((a, b) => a + b, 0);
  const credit = steps.map(() => 0);
  const order: ShapeKind[] = [];
  for (let n = 0; n < total; n += 1) {
    let best = 0;
    for (let i = 0; i < steps.length; i += 1) {
      credit[i]! += slots[i]!;
      if (credit[i]! > credit[best]!) best = i;
    }
    credit[best]! -= total;
    order.push(steps[best]!.kind);
  }
  rotations.set(layout, order);
  return order.length > 0 ? order : null;
}

/** Share of the notes the reef plan turns into seabed life (the rest keep their rule: swimmers, giants, bubbles). */
export const REEF_SHARE = 0.4;

/** What a note becomes in a reef: seabed life of the inventory, picked by weight, or the kind its rule gave it. */
export function reefKind(template: WorldTemplate, seed: number, noteId: string, mapped: ShapeKind, index = 0): ShapeKind {
  const role = roleOf(mapped);
  if (role === 'giant' || role === 'effect') return mapped;
  const rotation = rotationOf(template);
  // The director's sequence orders every grounded note, whatever its rule gave it; swimmers keep their rule.
  if (role === 'benthic') return rotation ? rotation[index % rotation.length]! : mapped;
  const rng = noteStream(seed, `${noteId}:reefkind`);
  if (rng() >= REEF_SHARE) return mapped;
  if (rotation) return rotation[index % rotation.length]!;
  const items = inventoryOf(template).filter((i) => i.role === 'benthic' && (PICK_WEIGHT[i.kind] ?? 1) > 0);
  if (items.length === 0) return mapped;
  const total = items.reduce((n, i) => n + (PICK_WEIGHT[i.kind] ?? 1), 0);
  let u = rng() * total;
  for (const item of items) {
    u -= PICK_WEIGHT[item.kind] ?? 1;
    if (u <= 0) return item.kind;
  }
  return items[items.length - 1]!.kind;
}
