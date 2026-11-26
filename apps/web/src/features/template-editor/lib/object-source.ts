import { MAX_RECIPES } from '../consts/recipe.consts';
import { addRecipe, freshRecipeName } from './recipe-model';
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

/** Triangle positions (non-indexed) and part tints of the object, or null when it has no editable shape. */
export function objectMesh(template: Template, object: InventoryObject): { positions: ArrayLike<number>; colors?: ArrayLike<number> } | null {
  const recipe = recipeOf(template, object);
  const geometry = recipe ? buildRecipeGeometry(recipe, template.palette) : null;
  if (!geometry) return null;
  const positions = geometry.getAttribute('position').array;
  const colors = geometry.hasAttribute('color') ? geometry.getAttribute('color').array : undefined;
  geometry.dispose();
  return { positions, colors };
}

/** Triangle positions (non-indexed) of the object, or null when it has no editable shape. */
export function objectPositions(template: Template, object: InventoryObject): ArrayLike<number> | null {
  return objectMesh(template, object)?.positions ?? null;
}

/** Adds the stock copy of a builtin object as a recipe of the template; returns its new kind, or null when not possible. */
export function copyStockAsRecipe(template: Template, object: InventoryObject): { template: Template; kind: string } | null {
  const stock = object.recipeIndex === null ? recipeOf(template, object) : null;
  if (!stock || template.recipes.length >= MAX_RECIPES) return null;
  const name = freshRecipeName(template.recipes.map((r) => r.name), stock.name);
  const copy = { ...structuredClone(stock), name } as Template['recipes'][number];
  return { template: addRecipe(template, copy), kind: `recipe:${name}` };
}
