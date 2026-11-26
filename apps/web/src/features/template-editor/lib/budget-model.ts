import type { Template } from '@/templates/generated';
import { triangleCount } from '@/xr/shapes/builtin-shapes';
import { buildRecipeGeometry, type ShapeRecipe } from '@/xr/shapes/recipe-builder';
import { recipeTriangles, type Recipe } from './recipe-model';
import { templateObjects } from './inventory-model';

/** Quest 3 budget (`tech.md`): fewer than 100 draw calls, one instanced mesh per shape kind. */
export const MAX_DRAW_CALLS = 100;
/** Draw calls that are not shape kinds: terrain, sky, staff, particles, shadows, links (estimate, I8c measured 58 in all). */
export const BASE_DRAW_CALLS = 12;

/** Triangles of the geometry the web builder really makes (booleans, bevels and extrusions included). */
export function liveTriangles(recipe: Recipe, palette: Template['palette']): number {
  if ((recipe.nodes ?? []).length === 0) return recipeTriangles(recipe);
  const geometry = buildRecipeGeometry(recipe as unknown as ShapeRecipe, palette);
  if (!geometry) return 0;
  const count = triangleCount(geometry);
  geometry.dispose();
  return count;
}

/** One instanced mesh per shape kind the template uses, plus the fixed world meshes. */
export function drawCallEstimate(template: Template): number {
  const used = templateObjects(template).filter((o) => o.usage.mappings + o.usage.scenery + o.usage.zones > 0).length;
  return BASE_DRAW_CALLS + used;
}
