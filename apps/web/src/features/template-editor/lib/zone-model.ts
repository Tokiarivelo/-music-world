import type { Zone } from '../consts/template-editor.consts';

export type ZonePreset = 'whole' | 'left' | 'right' | 'far' | 'near' | 'centre';
export const ZONE_PRESETS: readonly ZonePreset[] = ['whole', 'left', 'right', 'far', 'near', 'centre'];

type Bounds = Pick<Zone, 'xMin' | 'xMax' | 'zMin' | 'zMax'>;

const RECTS: Readonly<Record<ZonePreset, Bounds>> = {
  whole: { xMin: -1, xMax: 1, zMin: -1, zMax: 1 },
  left: { xMin: -1, xMax: 0, zMin: -1, zMax: 1 },
  right: { xMin: 0, xMax: 1, zMin: -1, zMax: 1 },
  far: { xMin: -1, xMax: 1, zMin: -1, zMax: 0 },
  near: { xMin: -1, xMax: 1, zMin: 0, zMax: 1 },
  centre: { xMin: -0.5, xMax: 0.5, zMin: -0.5, zMax: 0.5 },
};

export function applyZonePreset(zone: Zone, preset: ZonePreset): Zone {
  return { ...zone, ...RECTS[preset] };
}

/** The preset a zone currently equals, or null for a custom rectangle. */
export function presetOf(zone: Bounds): ZonePreset | null {
  return ZONE_PRESETS.find((p) => (['xMin', 'xMax', 'zMin', 'zMax'] as const).every((k) => RECTS[p][k] === zone[k])) ?? null;
}

/** Share of the plate a zone covers, 0..100 (0 for an inverted rectangle). */
export function coveragePercent(zone: Bounds): number {
  const w = Math.max(0, zone.xMax - zone.xMin);
  const d = Math.max(0, zone.zMax - zone.zMin);
  return Math.round((w * d * 100) / 4);
}

/** Rectangle of a zone in a `size` x `size` top view: x grows to the right, z grows downward (far at the top). */
export function zoneRect(zone: Bounds, size: number): { x: number; y: number; w: number; h: number } {
  const to = (v: number) => ((Math.min(1, Math.max(-1, v)) + 1) / 2) * size;
  const x = to(zone.xMin);
  const y = to(zone.zMin);
  return { x, y, w: Math.max(0, to(zone.xMax) - x), h: Math.max(0, to(zone.zMax) - y) };
}
