import { isCityKind } from '@/engine/city';
import { roleOf, type ObjectRole } from '@/engine/world-plan';
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
    };
  });
  return objects.sort((a, b) => Number(b.origin === 'recipe') - Number(a.origin === 'recipe') || a.name.localeCompare(b.name));
}

export function totalUses(object: InventoryObject): number {
  return object.usage.mappings + object.usage.scenery + object.usage.zones;
}
