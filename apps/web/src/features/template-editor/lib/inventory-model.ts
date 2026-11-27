import { BUILDING_VARIANTS, buildingVariantOfRecipe, isCityKind, templateHasCity, type BuildingVariant } from '@/engine/city';
import { roleOf, worldPlanKind, type ObjectRole } from '@/engine/world-plan';
import { hasModel } from '@/xr/shapes/model-catalog';
import type { Template } from '@/templates/generated';

/** Pure inventory of the objects a template uses (spec 12, task 2.1). No React, no I/O. */

type Kind = Template['mappings'][number]['spawn'];

export interface ObjectUsage {
  /** Mapping rules that spawn this kind from notes. */
  readonly mappings: number;
  /** Objects of this kind that stand from the first frame (sum of the scenery counts). */
  readonly scenery: number;
  /** Zones that confine this kind. */
  readonly zones: number;
}

export type ObjectOrigin = 'recipe' | 'builtin';

export interface InventoryObject {
  readonly kind: Kind;
  /** Display name: the recipe name, or the builtin kind. */
  readonly name: string;
  readonly role: ObjectRole;
  readonly origin: ObjectOrigin;
  /** Index in `template.recipes` when the object is an editable recipe. */
  readonly recipeIndex: number | null;
  /** The city places it as a building, garden or monument (not by notes alone). */
  readonly cityKind: 'building' | 'garden' | 'monument' | null;
  /** An authored 3D model replaces the procedural shape at runtime. */
  readonly authored: boolean;
  readonly usage: ObjectUsage;
  /** The city building variant this recipe replaces (`building_<variant>`), if any. */
  readonly replaces: BuildingVariant | null;
}

const NO_USAGE: ObjectUsage = { mappings: 0, scenery: 0, zones: 0 };

function recipeNameOf(kind: Kind): string | null {
  return kind.startsWith('recipe:') ? kind.slice('recipe:'.length) : null;
}

/** Every object of the template with its usage, in a stable order: recipes first, then builtins, by name. */
export function templateObjects(template: Template): InventoryObject[] {
  const usage = new Map<Kind, ObjectUsage>();
  const bump = (kind: Kind, change: Partial<Record<keyof ObjectUsage, number>>): void => {
    const u = usage.get(kind) ?? NO_USAGE;
    usage.set(kind, {
      mappings: u.mappings + (change.mappings ?? 0),
      scenery: u.scenery + (change.scenery ?? 0),
      zones: u.zones + (change.zones ?? 0),
    });
  };
  for (const m of template.mappings ?? []) bump(m.spawn, { mappings: 1 });
  for (const s of template.scenery ?? []) bump(s.kind, { scenery: s.count });
  for (const z of template.zones ?? []) bump(z.kind, { zones: 1 });
  const recipes = template.recipes ?? [];
  recipes.forEach((r) => {
    const kind = `recipe:${r.name}` as Kind;
    if (!usage.has(kind)) usage.set(kind, NO_USAGE); // a recipe nobody uses is still in the inventory
  });
  const objects = [...usage.entries()].map(([kind, u]): InventoryObject => {
    const name = recipeNameOf(kind);
    const recipeIndex = name === null ? null : recipes.findIndex((r) => r.name === name);
    return {
      kind,
      name: name ?? kind,
      role: roleOf(kind),
      origin: recipeIndex !== null && recipeIndex >= 0 ? 'recipe' : 'builtin',
      recipeIndex: recipeIndex !== null && recipeIndex >= 0 ? recipeIndex : null,
      cityKind: isCityKind(kind),
      authored: hasModel(kind),
      usage: u,
      replaces: name === null ? null : buildingVariantOfRecipe(name),
    };
  });
  return objects.sort((a, b) => Number(b.origin === 'recipe') - Number(a.origin === 'recipe') || a.name.localeCompare(b.name));
}

export function totalUses(object: InventoryObject): number {
  return object.usage.mappings + object.usage.scenery + object.usage.zones;
}

/** Something the world adds to the template at run time: shown in the inventory, not edited as a recipe. */
const REEF_THEMES = ['keep', 'village', 'forest', 'crystal', 'kelp', 'coral', 'sand', 'wreck'] as const;
export type EngineObjectId = `building.${BuildingVariant}` | 'construction' | 'streets' | 'lakes' | 'bridges' | 'signals' | `patch.${(typeof REEF_THEMES)[number]}`;

export interface EngineObject {
  /** Stable id, also the i18n key suffix (`inventory.engine.item.<id>`). */
  readonly id: EngineObjectId;
  readonly group: 'city' | 'reef';
  /** Index into `buildingVariantGeometries()` when the object has a shape to draw; `'scaffold'` for the construction site. */
  readonly shape: number | 'scaffold' | null;
  /** The building variant, when the object can be edited as a recipe (`building_<variant>`). */
  readonly variant: BuildingVariant | null;
}

/**
 * What the engine builds around the objects of the template: the nine building variants, the streets, lakes, bridges,
 * traffic signals and construction sites of a city; the patches (themes) of a reef or a realm.
 */
export function engineObjects(template: Template): EngineObject[] {
  if (templateHasCity(template)) {
    return [
      ...BUILDING_VARIANTS.map((v, i): EngineObject => ({ id: `building.${v}`, group: 'city', shape: i, variant: v })),
      { id: 'construction', group: 'city', shape: 'scaffold', variant: null },
      { id: 'streets', group: 'city', shape: null, variant: null },
      { id: 'lakes', group: 'city', shape: null, variant: null },
      { id: 'bridges', group: 'city', shape: null, variant: null },
      { id: 'signals', group: 'city', shape: null, variant: null },
    ];
  }
  const plan = worldPlanKind(template);
  if (plan === 'reef' || plan === 'realm') return REEF_THEMES.map((theme): EngineObject => ({ id: `patch.${theme}`, group: 'reef', shape: null, variant: null }));
  return [];
}
