import { TemplateSchema, type Template } from '@/templates/generated';
import { RECIPE_NAME_PATTERN } from '../consts/recipe.consts';
import {
  BUILTIN_KINDS,
  FORBIDDEN_TEXT,
  MAX_TEMPLATE_BYTES,
  MIN_STAFF_CONTRAST,
} from '../consts/template-editor.consts';
import { drawCallEstimate, liveTriangles, MAX_DRAW_CALLS } from './budget-model';

/** `code` is an i18n key suffix (`editor:error.<code>`); `path` is the dotted field path (`palette.staff`). */
export type EditorErrorCode = 'schema' | 'contrast' | 'name' | 'kind' | 'size' | 'zoneOrder' | 'recipeName' | 'recipeBudget' | 'drawCalls';

export interface EditorError {
  path: string;
  code: EditorErrorCode;
}

function channel(c: number): number {
  return c <= 0.04045 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4;
}

export function relativeLuminance(hex: string): number {
  const [r, g, b] = [1, 3, 5].map((i) => channel(parseInt(hex.slice(i, i + 2), 16) / 255)) as [number, number, number];
  return 0.2126 * r + 0.7152 * g + 0.0722 * b;
}

/** Same rules as the server (`templates/domain/specification.py`) plus the zone order the zod schema cannot express. */
function specErrors(template: Template): EditorError[] {
  const errors: EditorError[] = [];
  const bytes = new TextEncoder().encode(JSON.stringify(template)).length;
  if (bytes > MAX_TEMPLATE_BYTES) errors.push({ path: '', code: 'size' });
  const known = new Set<string>([...BUILTIN_KINDS, ...template.recipes.map((r) => `recipe:${r.name}`)]);
  const seen = new Set<string>();
  template.recipes.forEach((recipe, i) => {
    if (!RECIPE_NAME_PATTERN.test(recipe.name) || seen.has(recipe.name)) errors.push({ path: `recipes.${i}.name`, code: 'recipeName' });
    seen.add(recipe.name);
    if (liveTriangles(recipe, template.palette) > recipe.budget.maxTriangles) errors.push({ path: `recipes.${i}.budget`, code: 'recipeBudget' });
  });
  if (drawCallEstimate(template) > MAX_DRAW_CALLS) errors.push({ path: 'mappings', code: 'drawCalls' });
  template.mappings.forEach((rule, i) => {
    if (!known.has(rule.spawn)) errors.push({ path: `mappings.${i}.spawn`, code: 'kind' });
  });
  template.zones.forEach((zone, i) => {
    if (!known.has(zone.kind)) errors.push({ path: `zones.${i}.kind`, code: 'kind' });
    if (zone.xMin >= zone.xMax) errors.push({ path: `zones.${i}.xMax`, code: 'zoneOrder' });
    if (zone.zMin >= zone.zMax) errors.push({ path: `zones.${i}.zMax`, code: 'zoneOrder' });
  });
  const { staff, background } = template.palette;
  if (Math.abs(relativeLuminance(staff) - relativeLuminance(background)) < MIN_STAFF_CONTRAST) {
    errors.push({ path: 'palette.staff', code: 'contrast' });
  }
  if (!template.name.trim() || FORBIDDEN_TEXT.test(template.name)) errors.push({ path: 'name', code: 'name' });
  return errors;
}

/** Empty when the template can be previewed, saved and published; otherwise the errors in document order. */
export function validateTemplate(template: unknown): EditorError[] {
  const parsed = TemplateSchema.safeParse(template);
  if (!parsed.success) {
    return parsed.error.issues.map((issue) => ({ path: issue.path.join('.'), code: 'schema' as const }));
  }
  return specErrors(parsed.data);
}

export function firstError(errors: readonly EditorError[], path: string): EditorError | undefined {
  return errors.find((e) => e.path === path);
}

/** Server `TEMPLATE_INVALID` details carry `loc` like `["template","palette","staff"]` → `palette.staff`. */
export function pathFromLoc(loc: readonly (string | number)[]): string {
  return (loc[0] === 'template' ? loc.slice(1) : loc).join('.');
}
