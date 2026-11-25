import { Color } from 'three';
import type { PaletteRole, WorldTemplate } from '@/engine/types';

type Palette = WorldTemplate['palette'];

/** Default structure gradient of the reference image: violet → magenta → cyan, by `t` in [0, 1]. */
export function gradientColor(palette: Palette, t: number, target = new Color()): Color {
  const c = Math.min(1, Math.max(0, t));
  const a = new Color(palette.primary);
  const b = new Color(palette.accent);
  const d = new Color(palette.secondary);
  return c < 0.5 ? target.copy(a).lerp(b, c * 2) : target.copy(b).lerp(d, (c - 0.5) * 2);
}

export function roleColor(palette: Palette, role: PaletteRole, target = new Color()): Color {
  return target.set(palette[role]);
}

/** Instance color: palette role or gradient, multiplied by the emissive intensity (unlit neon materials). */
export function structureColor(
  palette: Palette,
  role: PaletteRole | null,
  t: number,
  emissive: number,
  target = new Color(),
): Color {
  const base = role ? roleColor(palette, role, target) : gradientColor(palette, t, target);
  return base.multiplyScalar(emissive);
}

/** Linear-light factor for a perceived (sRGB-like) brightness multiplier: colors are stored linear in three.js. */
export function lightness(perceived: number): number {
  return Math.max(0, perceived) ** 2.2;
}

/** Colors of the environment around the plate (I2 requirement 2): all derived from the palette, linear-light. */
export interface EnvironmentColors {
  zenith: Color;
  mid: Color;
  horizon: Color;
  ground: Color;
  hillsNear: Color;
  hillsFar: Color;
  star: Color;
}

/**
 * Sky and land colors of a palette: the zenith stays close to `background`, the horizon glows toward `primary` and
 * `secondary`, the ground is a dark `terrain` tint that fades into the horizon color. Pure; a new palette (I4)
 * re-colors the environment with no code change.
 */
export function environmentColors(palette: Palette): EnvironmentColors {
  const background = new Color(palette.background);
  const terrain = new Color(palette.terrain);
  const primary = new Color(palette.primary);
  const secondary = new Color(palette.secondary);
  const zenith = background.clone().lerp(primary, 0.1);
  const mid = background.clone().lerp(primary, 0.3);
  const horizon = background.clone().lerp(primary, 0.5).lerp(secondary, 0.22);
  return {
    zenith,
    mid,
    horizon,
    ground: background.clone().lerp(terrain, 0.6).lerp(primary, 0.06),
    hillsNear: background.clone().lerp(terrain, 0.85).lerp(primary, 0.12),
    hillsFar: horizon.clone().lerp(background, 0.45),
    star: new Color(palette.staff),
  };
}

/** Colors of the water column of an `underwater` template: bright surface light above, deep blue at the horizon, sand below. */
export interface UnderwaterColors {
  readonly surface: Color;
  readonly mid: Color;
  readonly deep: Color;
  readonly ray: Color;
  readonly seabed: Color;
  readonly duneNear: Color;
  readonly duneFar: Color;
}

export function underwaterColors(palette: Palette): UnderwaterColors {
  const background = new Color(palette.background);
  const primary = new Color(palette.primary);
  const secondary = new Color(palette.secondary);
  const terrain = new Color(palette.terrain);
  const deep = background.clone().lerp(primary, 0.28);
  const sand = new Color('#b9a77c');
  return {
    surface: background.clone().lerp(primary, 0.7).lerp(secondary, 0.15),
    mid: background.clone().lerp(primary, 0.45),
    deep,
    ray: primary.clone().lerp(new Color(palette.staff), 0.55),
    seabed: terrain.clone().lerp(sand, 0.45).lerp(background, 0.25),
    duneNear: terrain.clone().lerp(sand, 0.3).lerp(background, 0.3),
    duneFar: deep.clone().lerp(terrain, 0.3),
  };
}
