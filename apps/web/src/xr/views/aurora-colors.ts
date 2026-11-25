/** The colors of a real aurora, shared by the sky backdrop and the staff of the northern-lights mode. */
import { Color } from 'three';

/** Oxygen green low, cyan, then nitrogen violet and magenta high up. */
export const AURORA_COLORS = ['#35ffa0', '#3fd8ff', '#b36bff'] as const;
/** Each curtain is green low and violet / magenta high (aurora photographs). */
export const AURORA_GREENS = ['#35ffa0', '#5dffb4', '#8affcc'] as const;
export const AURORA_TOPS = ['#b36bff', '#ff6bd6', '#8f7bff'] as const;

/** Aurora color of a pitch in 0..1 (low = green, mid = cyan, high = violet), written into `target`. */
export function auroraColor(pitch01: number, target: Color): Color {
  const c = Math.min(1, Math.max(0, pitch01));
  const [a, b, d] = AURORA_COLORS;
  return c < 0.5 ? target.set(a).lerp(new Color(b), c * 2) : target.set(b).lerp(new Color(d), (c - 0.5) * 2);
}
