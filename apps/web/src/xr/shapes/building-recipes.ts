/**
 * The nine city building variants (`house-shapes.ts`) as part-tree recipes, so a creator can edit them (spec 12, phase 8).
 * A recipe named `building_<variant>` in a template replaces that variant in the city (`structure-view.ts`); the shapes
 * below reproduce the built-in ones with boxes, gables and a tilted slab for the awning. Same frame as the variants: unit
 * footprint on x and z, base at y = 0, height 1.
 */
import { BUILDING_VARIANT_FOOTPRINT, BUILDING_VARIANT_HEIGHT, BUILDING_VARIANTS, buildingRecipeName, type BuildingVariant } from '@/engine/city';
import type { PartPalette } from './node-builder';
import { buildingVariantGeometries } from './house-shapes';
import { buildRecipeGeometry, type ShapeRecipe } from './recipe-builder';
import { recipe, type Spec } from './stock-recipes';
import type { BufferGeometry } from 'three';

const r3 = (v: number): number => Math.round(v * 1000) / 1000;

/** An axis-aligned box from corner `(x0, y0, z0)` to `(x1, y1, z1)`, as a part. */
function box(id: string, name: string, x0: number, y0: number, z0: number, x1: number, y1: number, z1: number): Spec {
  return { id, name, primitive: 'box', at: [r3((x0 + x1) / 2), y0, r3((z0 + z1) / 2)], size: [r3(x1 - x0), r3(y1 - y0), r3(z1 - z0)] };
}

/** A gabled roof with its ridge along x (the variants' convention): eaves at `eave`, ridge at `top`. */
function gable(id: string, name: string, x0: number, x1: number, z0: number, z1: number, eave: number, top: number): Spec {
  return { id, name, primitive: 'gable', at: [r3((x0 + x1) / 2), eave, r3((z0 + z1) / 2)], rot: [0, 90, 0], size: [r3(z1 - z0), r3(top - eave), r3(x1 - x0)] };
}

/** A slanted slab from the wall at `yHigh` down to `yLow`, `zOut` metres further out (the shop's awning). */
function awning(id: string, name: string, x0: number, x1: number, zWall: number, zOut: number, yHigh: number, yLow: number): Spec {
  const dz = zOut - zWall;
  const dy = yHigh - yLow;
  return { id, name, primitive: 'box', at: [r3((x0 + x1) / 2), yHigh, zWall], rot: [r3((Math.atan2(dy, dz) * 180) / Math.PI), 0, 0], size: [r3(x1 - x0), 0.02, r3(Math.hypot(dz, dy))] };
}

const PARTS: Readonly<Record<BuildingVariant, readonly Spec[]>> = {
  tower: [box('body', 'Body', -0.5, 0, -0.5, 0.5, 0.8, 0.5), box('top', 'Set-back top', -0.3, 0.8, -0.3, 0.3, 1, 0.3)],
  house: [
    box('walls', 'Walls', -0.5, 0, -0.38, 0.5, 0.52, 0.38),
    gable('roof', 'Roof', -0.56, 0.56, -0.5, 0.5, 0.52, 0.92),
    box('chimney', 'Chimney', 0.2, 0.7, -0.2, 0.34, 1, -0.06),
    box('porch', 'Porch step', -0.15, 0, 0.38, 0.15, 0.06, 0.5),
  ],
  apartment: [
    box('slab', 'Slab', -0.5, 0, -0.5, 0.5, 0.9, 0.5),
    box('parapet', 'Parapet', -0.54, 0.9, -0.54, 0.54, 0.96, 0.54),
    box('stair', 'Stair head', -0.18, 0.96, -0.18, 0.18, 1, 0.18),
  ],
  shop: [
    box('shop', 'Shop', -0.5, 0, -0.5, 0.5, 0.78, 0.46),
    awning('awning', 'Awning', -0.46, 0.46, 0.46, 0.7, 0.42, 0.3),
    box('sign', 'Sign', -0.3, 0.78, -0.05, 0.3, 1, 0.05),
  ],
  skyscraper: [
    box('base', 'Base', -0.5, 0, -0.5, 0.5, 0.55, 0.5),
    box('middle', 'Middle', -0.38, 0.55, -0.38, 0.38, 0.82, 0.38),
    box('upper', 'Upper', -0.24, 0.82, -0.24, 0.24, 0.94, 0.24),
    box('mast', 'Mast', -0.03, 0.94, -0.03, 0.03, 1, 0.03),
  ],
  villa: [
    box('main', 'Main wing', -0.5, 0, -0.3, 0.5, 0.5, 0.3),
    gable('main_roof', 'Main roof', -0.56, 0.56, -0.38, 0.38, 0.5, 0.78),
    box('side', 'Side wing', -0.5, 0, 0.3, -0.1, 0.5, 0.52),
    gable('side_roof', 'Side roof', -0.54, -0.06, 0.26, 0.56, 0.5, 0.74),
    box('chimney', 'Chimney', 0.28, 0.65, -0.2, 0.4, 0.95, -0.08),
    box('turret', 'Turret', 0.1, 0.5, -0.02, 0.3, 0.9, 0.18),
    box('turret_top', 'Turret top', 0.07, 0.9, -0.05, 0.33, 1, 0.21),
  ],
  warehouse: [
    box('hall', 'Hall', -0.5, 0, -0.45, 0.5, 0.6, 0.45),
    ...[0, 1, 2, 3].map((k) => gable(`saw_${k + 1}`, `Sawtooth ${k + 1}`, -0.5 + k * 0.25, -0.25 + k * 0.25, -0.45, 0.45, 0.6, 0.82)),
    box('dock_l', 'Dock left', -0.4, 0, 0.45, -0.2, 0.28, 0.54),
    box('dock_r', 'Dock right', 0.2, 0, 0.45, 0.4, 0.28, 0.54),
    box('vent', 'Vent', 0.3, 0.8, -0.3, 0.38, 1, -0.22),
  ],
  twin: [
    box('tower_l', 'Left tower', -0.5, 0, -0.3, -0.12, 1, 0.3),
    box('tower_r', 'Right tower', 0.12, 0, -0.3, 0.5, 0.92, 0.3),
    box('bridge', 'Sky bridge', -0.12, 0.55, -0.12, 0.12, 0.65, 0.12),
  ],
  pagoda: [
    box('plinth', 'Plinth', -0.4, 0, -0.4, 0.4, 0.12, 0.4),
    ...[0, 1, 2].flatMap((k) => {
      const y = 0.12 + k * 0.27;
      const w = 0.34 - k * 0.07;
      return [box(`tier_${k + 1}`, `Tier ${k + 1}`, -w, y, -w, w, y + 0.15, w), gable(`roof_${k + 1}`, `Roof ${k + 1}`, -w - 0.12, w + 0.12, -w - 0.12, w + 0.12, y + 0.15, y + 0.27)];
    }),
    box('spire', 'Spire', -0.015, 0.93, -0.015, 0.015, 1, 0.015),
  ],
};

/** The editable recipe of a built-in building variant. */
export function buildingRecipe(variant: BuildingVariant): ShapeRecipe {
  const i = BUILDING_VARIANTS.indexOf(variant);
  return recipe(buildingRecipeName(variant), [...PARTS[variant]], BUILDING_VARIANT_FOOTPRINT[i] ?? 0.4, BUILDING_VARIANT_HEIGHT[i] ?? 1);
}

/**
 * Geometry of each building variant, in the order of `BUILDING_VARIANTS`: the built-in shape, or the template's
 * `building_<variant>` recipe when it has one and it builds (flat shaded, like the built-in variants).
 */
export function resolveBuildingGeometries(recipes: readonly ShapeRecipe[], palette?: PartPalette): BufferGeometry[] {
  return buildingVariantGeometries().map((builtin, i) => {
    const name = buildingRecipeName(BUILDING_VARIANTS[i]!);
    const found = recipes.find((r) => r.name === name);
    const custom = found ? buildRecipeGeometry(found, palette) : null;
    if (!custom) return builtin;
    builtin.dispose();
    custom.computeVertexNormals(); // non-indexed: one normal per face
    return custom;
  });
}
