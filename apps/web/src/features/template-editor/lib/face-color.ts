import type { ThumbFace } from './thumbnail';

/** `rgb(...)` of a face: base colour x part tint x light, clamped (a glowing part may exceed 1). */
export function faceFill(base: readonly [number, number, number], face: Pick<ThumbFace, 'shade' | 'tint'>): string {
  const c = base.map((v, i) => Math.min(255, Math.round(v * face.tint[i]! * face.shade)));
  return `rgb(${c[0]},${c[1]},${c[2]})`;
}
