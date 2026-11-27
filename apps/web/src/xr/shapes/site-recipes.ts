/**
 * The other shapes the city draws itself, as part-tree recipes (spec 12, phase 9): the construction scaffold, the tower
 * crane and the traffic-light pole. A template recipe with the same name replaces the built-in shape. Frames follow the
 * built-in geometries (`house-shapes.ts`, `city-view.ts`).
 */
import { BUILDING_VARIANTS, SIGNAL_POLE_RECIPE, SITE_CRANE_RECIPE, SITE_SCAFFOLD_RECIPE, buildingVariantOfRecipe } from '@/engine/city';
import type { BufferGeometry } from 'three';
import { box, buildingRecipe } from './building-recipes';
import type { PartPalette } from './node-builder';
import { buildRecipeGeometry, type ShapeRecipe } from './recipe-builder';
import { recipe, type Spec } from './stock-recipes';

/** Real height of the traffic-light pole with its head: the recipe is normalised to 1 and scaled back to this. */
export const SIGNAL_POLE_HEIGHT = 0.365;

/** A square frame: four corner poles and four levels of rails (the built-in scaffold has eight, within the part limit here). */
function scaffoldParts(): Spec[] {
  const t = 0.02;
  const parts: Spec[] = [];
  ([[-0.5, -0.5], [0.5, -0.5], [-0.5, 0.5], [0.5, 0.5]] as const).forEach(([x, z], i) => parts.push(box(`pole_${i + 1}`, `Pole ${i + 1}`, x - t, 0, z - t, x + t, 1, z + t)));
  for (let k = 1; k <= 4; k += 1) {
    const y = k / 4 - 0.01;
    const h = 0.02;
    parts.push(
      box(`rail_n${k}`, `Rail north ${k}`, -0.5, y, -0.5 - t, 0.5, y + h, -0.5 + t),
      box(`rail_s${k}`, `Rail south ${k}`, -0.5, y, 0.5 - t, 0.5, y + h, 0.5 + t),
      box(`rail_w${k}`, `Rail west ${k}`, -0.5 - t, y, -0.5, -0.5 + t, y + h, 0.5),
      box(`rail_e${k}`, `Rail east ${k}`, 0.5 - t, y, -0.5, 0.5 + t, y + h, 0.5),
    );
  }
  return parts;
}

const CRANE_PARTS: Spec[] = [
  box('mast', 'Mast', -0.02, 0, -0.02, 0.02, 1, 0.02),
  box('jib', 'Jib', -0.35, 0.96, -0.02, 1.1, 0.985, 0.02),
  box('counterweight', 'Counterweight', -0.35, 0.93, -0.03, -0.18, 0.96, 0.03),
  box('hook_line', 'Hook line', 0.78, 0.8, -0.02, 0.8, 0.96, 0.02),
  box('hook_block', 'Hook block', 0.765, 0.78, -0.016, 0.805, 0.8, 0.016),
  box('tip', 'Tip', -0.015, 0.985, -0.015, 0.015, 1.04, 0.015),
];

const POLE_PARTS: Spec[] = [
  box('pole', 'Pole', -0.01, 0, -0.01, 0.01, 0.34, 0.01),
  box('head', 'Signal head', -0.0275, 0.235, -0.008, 0.0275, 0.365, 0.032),
];

/** Recipe names the editor can create for the shapes of a city, with their builders. */
export const ENGINE_RECIPE_NAMES: readonly string[] = [...BUILDING_VARIANTS.map((v) => `building_${v}`), SITE_SCAFFOLD_RECIPE, SITE_CRANE_RECIPE, SIGNAL_POLE_RECIPE];

/** The editable recipe that stands for a shape the city draws itself, by its recipe name; `null` for any other name. */
export function engineRecipe(name: string): ShapeRecipe | null {
  const variant = buildingVariantOfRecipe(name);
  if (variant) return buildingRecipe(variant);
  if (name === SITE_SCAFFOLD_RECIPE) return recipe(name, scaffoldParts(), 1);
  if (name === SITE_CRANE_RECIPE) return recipe(name, CRANE_PARTS, 1);
  if (name === SIGNAL_POLE_RECIPE) return recipe(name, POLE_PARTS, 0.1, SIGNAL_POLE_HEIGHT);
  return null;
}

/** A template's recipe `name` built as a lit-ready geometry (flat normals), or `builtin` when it has none or builds nothing. */
function replaced(recipes: readonly ShapeRecipe[], name: string, palette: PartPalette | undefined, builtin: BufferGeometry): BufferGeometry {
  const found = recipes.find((r) => r.name === name);
  const custom = found ? buildRecipeGeometry(found, palette) : null;
  if (!custom) return builtin;
  builtin.dispose();
  custom.computeVertexNormals();
  return custom;
}

export const resolveScaffoldGeometry = (recipes: readonly ShapeRecipe[], builtin: BufferGeometry, palette?: PartPalette): BufferGeometry =>
  replaced(recipes, SITE_SCAFFOLD_RECIPE, palette, builtin);

export const resolveCraneGeometry = (recipes: readonly ShapeRecipe[], builtin: BufferGeometry, palette?: PartPalette): BufferGeometry =>
  replaced(recipes, SITE_CRANE_RECIPE, palette, builtin);

/** The traffic-light pole: the recipe is normalised to height 1, so it is scaled back to the real pole height. */
export function resolvePoleGeometry(recipes: readonly ShapeRecipe[], builtin: BufferGeometry, palette?: PartPalette): BufferGeometry {
  const out = replaced(recipes, SIGNAL_POLE_RECIPE, palette, builtin);
  if (out !== builtin) out.scale(1, SIGNAL_POLE_HEIGHT, 1);
  return out;
}
