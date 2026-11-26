import { buildRecipeGeometry, type ShapeRecipe } from '@/xr/shapes/recipe-builder';
import { STOCK_RECIPES } from '@/xr/shapes/stock-recipes';
import type { Template } from '@/templates/generated';
import type { InventoryObject } from './inventory-model';

/** Stock recipe that stands for a runtime builtin kind in the editor. */
const STOCK_OF: Readonly<Record<string, string>> = { building: 'house', tree: 'tree', conifer: 'conifer', car: 'car' };

/** The editable recipe of an inventory object: its own recipe, or the stock copy of a builtin; null when none. */
export function recipeOf(template: Template, object: InventoryObject): ShapeRecipe | null {
  if (object.recipeIndex !== null) return (template.recipes[object.recipeIndex] as ShapeRecipe | undefined) ?? null;
  const stock = STOCK_OF[object.kind];
  return stock ? (STOCK_RECIPES.find((r) => r.name === stock) ?? null) : null;
}

/** Triangle positions (non-indexed) of the object, or null when it has no editable shape. */
export function objectPositions(template: Template, object: InventoryObject): ArrayLike<number> | null {
  const recipe = recipeOf(template, object);
  const geometry = recipe ? buildRecipeGeometry(recipe) : null;
  if (!geometry) return null;
  const positions = geometry.getAttribute('position').array;
  geometry.dispose();
  return positions;
}
