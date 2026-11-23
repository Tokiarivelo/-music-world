import { Color } from 'three';
import type { ColorRole, WorldTemplate } from '@/engine/types';

type Palette = WorldTemplate['palette'];

/** Default structure gradient of the reference image: violet → magenta → cyan, by `t` in [0, 1]. */
export function gradientColor(palette: Palette, t: number, target = new Color()): Color {
  const c = Math.min(1, Math.max(0, t));
  const a = new Color(palette.primary);
  const b = new Color(palette.accent);
  const d = new Color(palette.secondary);
  return c < 0.5 ? target.copy(a).lerp(b, c * 2) : target.copy(b).lerp(d, (c - 0.5) * 2);
}

export function roleColor(palette: Palette, role: ColorRole, target = new Color()): Color {
  return target.set(palette[role]);
}

/** Instance color: palette role or gradient, multiplied by the emissive intensity (unlit neon materials). */
export function structureColor(
  palette: Palette,
  role: ColorRole | null,
  t: number,
  emissive: number,
  target = new Color(),
): Color {
  const base = role ? roleColor(palette, role, target) : gradientColor(palette, t, target);
  return base.multiplyScalar(emissive);
}
