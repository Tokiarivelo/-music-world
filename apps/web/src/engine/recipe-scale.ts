/**
 * Per-recipe scale (`ShapeRecipe.footprint`, `heightScale`): a recipe can be wide and squat (a turtle, a wreck) or
 * slim and tall, instead of the one-size-fits-all 0.25 m footprint. Builtin kinds keep their own constants.
 */
import { RECIPE_FOOTPRINT_M } from './constants';
import type { ShapeKind, WorldTemplate } from './types';

export interface RecipeScale {
  /** Side of the unit footprint, in metres. */
  readonly footprint: number;
  /** Multiplier of the instance height. */
  readonly heightScale: number;
}

const DEFAULT_SCALE: RecipeScale = { footprint: RECIPE_FOOTPRINT_M, heightScale: 1 };

/** Scale of `recipe:<name>`; the default for any other kind or a name the template does not define. */
export function recipeScale(template: WorldTemplate, kind: ShapeKind): RecipeScale {
  if (!kind.startsWith('recipe:')) return DEFAULT_SCALE;
  const name = kind.slice('recipe:'.length);
  const recipe = template.recipes.find((r) => r.name === name);
  if (!recipe) return DEFAULT_SCALE;
  return { footprint: recipe.footprint ?? DEFAULT_SCALE.footprint, heightScale: recipe.heightScale ?? 1 };
}

export interface VariantLook {
  /** Multiplier of the instance height. */
  readonly height: number;
  /** Lightness jitter range (+/- share). */
  readonly jitter: number;
}

const PLAIN_LOOK: VariantLook = { height: 1, jitter: 0 };

/** Look of variant `index` of `recipe:<name>` (a name or index the recipe does not define keeps the plain look). */
export function variantLook(template: WorldTemplate, kind: ShapeKind, index: number): VariantLook {
  if (!kind.startsWith('recipe:')) return PLAIN_LOOK;
  const recipe = template.recipes.find((r) => r.name === kind.slice('recipe:'.length));
  const variant = recipe?.variants?.[index];
  return variant ? { height: variant.height ?? 1, jitter: variant.jitter ?? 0 } : PLAIN_LOOK;
}

/** Hex colour with its lightness moved by `jitter * unit` (`unit` in [-1, 1], from a seeded draw): deterministic. */
export function jitterHex(hex: string, jitter: number, unit: number): string {
  if (jitter <= 0) return hex;
  const f = 1 + jitter * Math.max(-1, Math.min(1, unit));
  const channel = (i: number): string =>
    Math.max(0, Math.min(255, Math.round(parseInt(hex.slice(1 + i * 2, 3 + i * 2), 16) * f)))
      .toString(16)
      .padStart(2, '0');
  return `#${channel(0)}${channel(1)}${channel(2)}`;
}
