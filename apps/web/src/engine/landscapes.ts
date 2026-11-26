/**
 * Predefined landscapes of the dome world (viewer choice, never part of a template): data only. `template` keeps the
 * palette-derived ground and hills; the others give the ground a photographic tile (ambientCG, CC0, `public/ground`)
 * and their own hills and haze. Colors are `#rrggbb` in sRGB.
 */
export const LANDSCAPE_IDS = ['template', 'meadow', 'desert', 'snow', 'rocky', 'city'] as const;
export type LandscapeId = (typeof LANDSCAPE_IDS)[number];
export const DEFAULT_LANDSCAPE: LandscapeId = 'meadow';

export interface Landscape {
  readonly id: LandscapeId;
  /** Ground tile file in `public/ground` without extension, or null for the palette ground. */
  readonly texture: string | null;
  /** Side of one tile in metres at the immersive scale. */
  readonly tileM: number;
  /** Brightness multiplier of the unlit ground tile (unlit materials look brighter than lit ones). */
  readonly gain: number;
  /** Haze color the ground and the hills melt into at the horizon. */
  readonly haze: string;
  readonly hillsNear: string;
  readonly hillsFar: string;
  /** Height of the hills relative to the default, and how jagged their crest is (0 smooth, 1 rugged). */
  readonly hillAmp: number;
  readonly hillJag: number;
}

export const LANDSCAPES: Readonly<Record<LandscapeId, Landscape>> = {
  template: { id: 'template', texture: null, tileM: 8, gain: 1, haze: '#000000', hillsNear: '#000000', hillsFar: '#000000', hillAmp: 1, hillJag: 0.3 },
  meadow: { id: 'meadow', texture: 'meadow', tileM: 6, gain: 1.12, haze: '#b5d5e5', hillsNear: '#489632', hillsFar: '#6a9eb8', hillAmp: 1.25, hillJag: 0.25 },
  desert: { id: 'desert', texture: 'desert', tileM: 9, gain: 0.95, haze: '#e6c9a0', hillsNear: '#b98b55', hillsFar: '#d8b98e', hillAmp: 0.55, hillJag: 0 },
  snow: { id: 'snow', texture: 'snow', tileM: 7, gain: 0.95, haze: '#dfe6ee', hillsNear: '#c4ceda', hillsFar: '#e3e9f1', hillAmp: 1.5, hillJag: 0.6 },
  rocky: { id: 'rocky', texture: 'rocky', tileM: 6, gain: 0.85, haze: '#b9a99a', hillsNear: '#6d5f55', hillsFar: '#a89a8d', hillAmp: 1.8, hillJag: 1 },
  city: { id: 'city', texture: 'city', tileM: 5, gain: 0.8, haze: '#9aa3b2', hillsNear: '#4a4f5c', hillsFar: '#8a92a3', hillAmp: 0.6, hillJag: 0.1 },
};

export function isLandscapeId(value: unknown): value is LandscapeId {
  return typeof value === 'string' && (LANDSCAPE_IDS as readonly string[]).includes(value);
}
