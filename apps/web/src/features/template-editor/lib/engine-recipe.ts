import { buildingRecipeName, type BuildingVariant } from '@/engine/city';
import { buildingRecipe } from '@/xr/shapes/building-recipes';
import type { Template } from '@/templates/generated';
import { MAX_RECIPES } from '../consts/recipe.consts';
import { addRecipe } from './recipe-model';

/** The recipe that replaces a city building variant in this template, as `recipe:<name>`; `null` when there is none. */
export function buildingRecipeKind(template: Template, variant: BuildingVariant): string | null {
  const name = buildingRecipeName(variant);
  return template.recipes.some((r) => r.name === name) ? `recipe:${name}` : null;
}

/**
 * Adds the editable recipe of a built-in building variant (`building_<variant>`): the city then draws the recipe instead of
 * the built-in shape. Returns the template and the new kind, the existing kind when the template already has it, or `null`
 * when the template is out of recipes.
 */
export function addBuildingRecipe(template: Template, variant: BuildingVariant): { template: Template; kind: string } | null {
  const existing = buildingRecipeKind(template, variant);
  if (existing) return { template, kind: existing };
  if (template.recipes.length >= MAX_RECIPES) return null;
  return { template: addRecipe(template, buildingRecipe(variant) as Template['recipes'][number]), kind: `recipe:${buildingRecipeName(variant)}` };
}
