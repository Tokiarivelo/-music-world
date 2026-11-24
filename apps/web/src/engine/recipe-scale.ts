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
