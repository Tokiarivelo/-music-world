/**
 * Spawn positions (requirement 1.4): each note lands inside one of the template zones of its shape kind, at a point
 * derived only from its pitch and its own seeded PRNG stream.
 *
 * Plate frame: centred on the origin, top face at y = 0, x to the right, z toward the viewer, in metres.
 * Template zones are normalized to [-1, 1] on both axes and scaled by `PLATE_INSET × size / 2`.
 * Placement: a jittered grid — pitch picks the column (low notes on the left), the PRNG picks the zone, the row and
 * the jitter inside the cell, keeping a margin so neighbouring cells do not overlap.
 */
import { LAYOUT_CELL_MARGIN, LAYOUT_CELL_SIZE, PIANO_HIGH_MIDI, PIANO_LOW_MIDI, PLATE_INSET } from './constants';
import type { NumericRange } from './mapping';
import { noteStream } from './prng';
import { worldSize } from './city';
import type { ShapeKind, Vec3, WorldTemplate } from './types';

/** Zone rectangle in plate metres (min < max on both axes). */
export interface ZoneRect {
  readonly xMin: number;
  readonly xMax: number;
  readonly zMin: number;
  readonly zMax: number;
}

const WHOLE_PLATE = { xMin: -1, xMax: 1, zMin: -1, zMax: 1 } as const;

function clampUnit(v: number): number {
  return Math.min(1, Math.max(-1, v));
}

function clamp01(v: number): number {
  return Math.min(1, Math.max(0, v));
}

/** Zones of `kind` in metres; the whole (inset) plate when the template defines none or only degenerate ones. */
export function zonesFor(kind: ShapeKind, template: WorldTemplate): ZoneRect[] {
  const half = (worldSize(template) / 2) * PLATE_INSET;
  const normalized = template.zones
    .filter((z) => z.kind === kind)
    .map((z) => ({
      // zod does not re-check min < max (pydantic does): order the bounds defensively.
      xMin: clampUnit(Math.min(z.xMin, z.xMax)),
      xMax: clampUnit(Math.max(z.xMin, z.xMax)),
      zMin: clampUnit(Math.min(z.zMin, z.zMax)),
      zMax: clampUnit(Math.max(z.zMin, z.zMax)),
    }))
    .filter((z) => z.xMax > z.xMin && z.zMax > z.zMin);
  const zones = normalized.length > 0 ? normalized : [WHOLE_PLATE];
  return zones.map((z) => ({
    xMin: z.xMin * half,
    xMax: z.xMax * half,
    zMin: z.zMin * half,
    zMax: z.zMax * half,
  }));
}

/** Position of `midi` inside the rule pitch range (open bounds use the piano range), in [0, 1]. */
export function pitchFraction(midi: number, range: NumericRange | null): number {
  const lo = range && Number.isFinite(range.min) ? range.min : PIANO_LOW_MIDI;
  const hi = range && Number.isFinite(range.max) ? range.max : PIANO_HIGH_MIDI;
  if (hi <= lo) return 0.5;
  return clamp01((midi - lo) / (hi - lo));
}

/**
 * Arrangement of the structures inside their zones (viewer choice, never part of a template):
 * - `grid`: the default, pitch picks the column, rows are random (the original look);
 * - `rows`: pitch picks the row, so low notes stand in front and high notes far away, like tiers;
 * - `ring`: pitch walks around an ellipse, like a stage around the centre;
 * - `spiral`: pitch winds from the centre outwards, like a galaxy;
 * - `scatter`: no pitch order, a seeded random spread, like a forest.
 */
export const LAYOUT_MODES = ['grid', 'rows', 'ring', 'spiral', 'scatter'] as const;
export type LayoutMode = (typeof LAYOUT_MODES)[number];
export const DEFAULT_LAYOUT: LayoutMode = 'grid';

export function isLayoutMode(value: unknown): value is LayoutMode {
  return typeof value === 'string' && (LAYOUT_MODES as readonly string[]).includes(value);
}

/** Position in the unit square [0, 1]² for the non-grid layouts; `rng` draws the jitter, `f` is the pitch fraction. */
function unitPoint(mode: Exclude<LayoutMode, 'grid'>, f: number, rng: () => number): { u: number; v: number } {
  const m = LAYOUT_CELL_MARGIN;
  const inner = 1 - 2 * m;
  switch (mode) {
    case 'rows': {
      const bands = 6;
      const band = Math.min(bands - 1, Math.floor(f * bands));
      // low pitch = near the viewer (v = 1), high pitch = far (v = 0)
      return { u: m + inner * rng(), v: 1 - (band + m + inner * rng()) / bands };
    }
    case 'ring': {
      const angle = f * Math.PI * 2 + (rng() - 0.5) * 0.35;
      const radius = 0.62 + 0.3 * rng();
      return { u: 0.5 + 0.5 * radius * Math.cos(angle), v: 0.5 + 0.5 * radius * Math.sin(angle) };
    }
    case 'spiral': {
      const turns = 2.5;
      const angle = f * Math.PI * 2 * turns + (rng() - 0.5) * 0.3;
      const radius = 0.12 + 0.8 * f + (rng() - 0.5) * 0.08;
      return { u: 0.5 + 0.5 * radius * Math.cos(angle), v: 0.5 + 0.5 * radius * Math.sin(angle) };
    }
    case 'scatter':
      return { u: m + inner * rng(), v: m + inner * rng() };
  }
}

/** Landing point of one note; pure: depends only on (seed, noteId, midi, pitch range, zones, mode). */
export function placeNote(
  seed: number,
  noteId: string,
  midi: number,
  range: NumericRange | null,
  zones: readonly ZoneRect[],
  mode: LayoutMode = DEFAULT_LAYOUT,
): Vec3 {
  const rng = noteStream(seed, noteId);
  const zone = zones[Math.min(zones.length - 1, Math.floor(rng() * zones.length))] ?? zones[0];
  if (zone === undefined) throw new RangeError('placeNote: at least one zone is required');
  if (mode !== 'grid') {
    const { u, v } = unitPoint(mode, pitchFraction(midi, range), rng);
    const cu = clamp01(u);
    const cv = clamp01(v);
    return { x: zone.xMin + cu * (zone.xMax - zone.xMin), y: 0, z: zone.zMin + cv * (zone.zMax - zone.zMin) };
  }
  const width = zone.xMax - zone.xMin;
  const depth = zone.zMax - zone.zMin;
  const cols = Math.max(1, Math.floor(width / LAYOUT_CELL_SIZE));
  const rows = Math.max(1, Math.floor(depth / LAYOUT_CELL_SIZE));
  const col = Math.min(cols - 1, Math.floor(pitchFraction(midi, range) * cols));
  const row = Math.min(rows - 1, Math.floor(rng() * rows));
  const inner = 1 - 2 * LAYOUT_CELL_MARGIN;
  const cellW = width / cols;
  const cellD = depth / rows;
  return {
    x: zone.xMin + (col + LAYOUT_CELL_MARGIN + inner * rng()) * cellW,
    y: 0,
    z: zone.zMin + (row + LAYOUT_CELL_MARGIN + inner * rng()) * cellD,
  };
}
