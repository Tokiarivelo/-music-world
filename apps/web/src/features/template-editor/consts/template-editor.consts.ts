import type { Template } from '@/templates/generated';

export type Rule = Template['mappings'][number];
export type Zone = Template['zones'][number];
export type PaletteRole = keyof Template['palette'];

export const PALETTE_ROLES: readonly PaletteRole[] = ['background', 'terrain', 'primary', 'accent', 'secondary', 'staff'];
export const MAX_RULES = 32;
export const MAX_ZONES = 16;
export const MAX_TEMPLATE_BYTES = 32 * 1024;
export const MIN_STAFF_CONTRAST = 0.2;
export const MAX_NAME_LENGTH = 60;
export const MAX_ID_LENGTH = 60;
export const COPY_SUFFIX = ' (copy)';
export const FALLBACK_ID = 'my-template';

export const BUILTIN_KINDS = ['terrain_ridge', 'building', 'spike', 'crystal', 'cluster', 'cloud', 'tree', 'conifer', 'bush', 'car', 'bicycle', 'airplane'] as const;
export const HEIGHT_SOURCES = ['velocity', 'duration', 'pitch'] as const;
export const COLOR_ROLES = ['primary', 'accent', 'secondary', 'staff', 'line'] as const;
export const STEMS = ['vocals', 'drums', 'bass', 'other'] as const;

/** Numeric bounds of the schema (`music-world.template.v1`): every number control uses them. */
export const NUMBER_BOUNDS = {
  'terrain.size': { min: 4, max: 40, step: 0.5 },
  'staff.glow': { min: 0, max: 3, step: 0.1 },
  'staff.lookahead': { min: 1, max: 8, step: 0.5 },
  'staff.fallDuration': { min: 0.1, max: 2, step: 0.05 },
  'fx.bloom': { min: 0, max: 2, step: 0.1 },
  'zone.bound': { min: -1, max: 1, step: 0.05 },
} as const;
export type NumberField = keyof typeof NUMBER_BOUNDS;

/** Characters the store refuses in a name (mirrors `templates/domain/specification.py`). */
export const FORBIDDEN_TEXT = /(:\/\/|www\.|data:|javascript:|[<>\u0000-\u001f\u007f])/i;
