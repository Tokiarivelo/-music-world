import type { Template } from '@/templates/generated';
import { engineRecipe } from '@/xr/shapes/site-recipes';
import { MAX_RECIPES } from '../consts/recipe.consts';
import { addRecipe } from './recipe-model';

/** The recipe that replaces an engine shape in this template, as `recipe:<name>`; `null` when there is none. */
export function engineRecipeKind(template: Template, name: string): string | null {
  return template.recipes.some((r) => r.name === name) ? `recipe:${name}` : null;
}

/**
 * Adds the editable recipe of a shape the city draws itself (`building_<variant>`, `site_scaffold`, `site_crane`,
 * `signal_pole`): the city then draws the recipe instead of the built-in shape. Returns the template and the kind, the
 * existing kind when the template already has it, or `null` for an unknown name or a template out of recipes.
 */
export function addEngineRecipe(template: Template, name: string): { template: Template; kind: string } | null {
  const existing = engineRecipeKind(template, name);
  if (existing) return { template, kind: existing };
  const made = engineRecipe(name);
  if (!made || template.recipes.length >= MAX_RECIPES) return null;
  return { template: addRecipe(template, made as Template['recipes'][number]), kind: `recipe:${name}` };
}
