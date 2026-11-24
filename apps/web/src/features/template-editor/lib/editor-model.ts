import type { Template } from '@/templates/generated';
import {
  COPY_SUFFIX,
  FALLBACK_ID,
  MAX_ID_LENGTH,
  MAX_NAME_LENGTH,
  MAX_RULES,
  MAX_ZONES,
  NUMBER_BOUNDS,
  type NumberField,
  type PaletteRole,
  type Rule,
  type Zone,
} from '../consts/template-editor.consts';

/** Pure, immutable updates of a template (no React, no I/O): each returns a new template and never mutates its input. */

export function clampNumber(field: NumberField, value: number): number {
  const { min, max } = NUMBER_BOUNDS[field];
  if (!Number.isFinite(value)) return min;
  return Math.min(max, Math.max(min, value));
}

/** Kebab-case id (`^[a-z0-9]+(-[a-z0-9]+)*$`, ≤ 60) derived from a display name. */
export function slugify(name: string): string {
  const slug = name
    .normalize('NFKD')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, MAX_ID_LENGTH)
    .replace(/-+$/g, '');
  return slug || FALLBACK_ID;
}

/** A working copy of `source`: same content, "(copy)" name, no AI attribution. The source is untouched. */
export function copyOf(source: Template): Template {
  const name = `${source.name.slice(0, MAX_NAME_LENGTH - COPY_SUFFIX.length)}${COPY_SUFFIX}`;
  return { ...structuredClone(source), name, id: slugify(name), meta: null };
}

export function setName(template: Template, name: string): Template {
  return { ...template, name: name.slice(0, MAX_NAME_LENGTH), id: slugify(name) };
}

export function setPaletteColor(template: Template, role: PaletteRole, hex: string): Template {
  return { ...template, palette: { ...template.palette, [role]: hex } };
}

type Section = 'terrain' | 'staff' | 'fx';

/** Sets one enum or boolean field of `terrain`, `staff` or `fx` (the control only offers valid values). */
export function setOption<S extends Section, K extends keyof Template[S]>(
  template: Template,
  section: S,
  key: K,
  value: Template[S][K],
): Template {
  return { ...template, [section]: { ...template[section], [key]: value } };
}

/** Sets one numeric field, clamped to the schema bounds. */
export function setNumber(template: Template, field: Exclude<NumberField, 'zone.bound'>, value: number): Template {
  const [section, key] = field.split('.') as [Section, string];
  return { ...template, [section]: { ...template[section], [key]: clampNumber(field, value) } };
}

export function newRule(): Rule {
  return {
    when: { pitch: null, chord: null, stem: null, line: null, velocity: null },
    spawn: 'crystal',
    heightFrom: 'velocity',
    colorRole: null,
  };
}

export function addRule(template: Template, rule: Rule = newRule()): Template {
  if (template.mappings.length >= MAX_RULES) return template;
  return { ...template, mappings: [...template.mappings, rule] };
}

export function removeRule(template: Template, index: number): Template {
  if (template.mappings.length <= 1 || index < 0 || index >= template.mappings.length) return template;
  return { ...template, mappings: template.mappings.filter((_, i) => i !== index) };
}

export function updateRule(template: Template, index: number, change: (rule: Rule) => Rule): Template {
  const rule = template.mappings[index];
  if (!rule) return template;
  return { ...template, mappings: template.mappings.map((r, i) => (i === index ? change(rule) : r)) };
}

/** Order matters (first match wins): moves the rule at `from` to position `to`. */
export function moveRule(template: Template, from: number, to: number): Template {
  const { length } = template.mappings;
  if (from === to || from < 0 || to < 0 || from >= length || to >= length) return template;
  const mappings = [...template.mappings];
  const [rule] = mappings.splice(from, 1);
  mappings.splice(to, 0, rule!);
  return { ...template, mappings };
}

export function newZone(): Zone {
  return { kind: 'crystal', xMin: -0.5, xMax: 0.5, zMin: -0.5, zMax: 0.5 };
}

export function addZone(template: Template, zone: Zone = newZone()): Template {
  if (template.zones.length >= MAX_ZONES) return template;
  return { ...template, zones: [...template.zones, zone] };
}

export function removeZone(template: Template, index: number): Template {
  if (index < 0 || index >= template.zones.length) return template;
  return { ...template, zones: template.zones.filter((_, i) => i !== index) };
}

export function updateZone(template: Template, index: number, change: (zone: Zone) => Zone): Template {
  const zone = template.zones[index];
  if (!zone) return template;
  return { ...template, zones: template.zones.map((z, i) => (i === index ? change(zone) : z)) };
}

export type ZoneBound = 'xMin' | 'xMax' | 'zMin' | 'zMax';

/** Sets one rectangle edge, clamped to [-1, 1]. An inverted rectangle is allowed here and reported by validation. */
export function setZoneBound(template: Template, index: number, bound: ZoneBound, value: number): Template {
  return updateZone(template, index, (zone) => ({ ...zone, [bound]: clampNumber('zone.bound', value) }));
}

/** Recipe kinds a mapping or zone can use: the built-ins plus the recipes defined in the template (read-only). */
export function recipeKinds(template: Template): string[] {
  return template.recipes.map((r) => `recipe:${r.name}`);
}
