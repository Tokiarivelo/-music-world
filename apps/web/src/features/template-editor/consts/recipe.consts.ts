/** Bounds of `music-world.shape.v1` (`apps/api/music_world/schemas/shape.py`): every recipe control uses them. */

export const MAX_RECIPES = 16;
export const MAX_PARTS = 8;
export const RECIPE_NAME = { max: 40 } as const;
export const RECIPE_NAME_PATTERN = /^[a-z0-9_]{1,40}$/;
export const RECIPE_FALLBACK_KIND = 'crystal';
export const PART_OPS = ['box', 'prism', 'spike', 'stack', 'cluster'] as const;
export const PART_PRIMITIVES = ['box', 'prism', 'spike'] as const;

interface Bound {
  min: number;
  max: number;
  step: number;
  integer: boolean;
}

export const PART_BOUNDS = {
  width: { min: 0.05, max: 1, step: 0.05, integer: false },
  depth: { min: 0.05, max: 1, step: 0.05, integer: false },
  height: { min: 0.05, max: 1, step: 0.05, integer: false },
  y: { min: 0, max: 1, step: 0.05, integer: false },
  sides: { min: 3, max: 12, step: 1, integer: true },
  taper: { min: 0, max: 1, step: 0.05, integer: false },
  levels: { min: 2, max: 8, step: 1, integer: true },
  shrink: { min: 0.5, max: 1, step: 0.05, integer: false },
  count: { min: 2, max: 12, step: 1, integer: true },
  spread: { min: 0, max: 1, step: 0.05, integer: false },
  seedOffset: { min: 0, max: 99, step: 1, integer: true },
} as const satisfies Record<string, Bound>;
export type PartField = keyof typeof PART_BOUNDS;

export const RECIPE_BOUNDS = {
  footprint: { min: 0.1, max: 1.5, step: 0.05, integer: false },
  heightScale: { min: 0.1, max: 2, step: 0.05, integer: false },
  maxTriangles: { min: 12, max: 2000, step: 10, integer: true },
} as const satisfies Record<string, Bound>;
export type RecipeField = keyof typeof RECIPE_BOUNDS;

/** Fields each operation reads; the others are ignored by the builder, so the editor hides them. */
export const FIELDS_BY_OP: Record<(typeof PART_OPS)[number], readonly PartField[]> = {
  box: ['width', 'depth', 'height', 'y'],
  prism: ['width', 'height', 'y', 'sides', 'taper'],
  spike: ['width', 'height', 'y'],
  stack: ['width', 'depth', 'height', 'y', 'levels', 'shrink', 'sides', 'taper'],
  cluster: ['width', 'depth', 'height', 'y', 'count', 'spread', 'seedOffset', 'sides', 'taper'],
};
