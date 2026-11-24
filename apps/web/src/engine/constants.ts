/** Engine constants (no magic values in engine modules). Distances in metres, times in seconds. */
import type { ShapeKind } from './types';

/** Kind used when no mapping rule matches a note. */
export const FALLBACK_KIND: ShapeKind = 'building';

/** MIDI range used to normalize an open pitch range (`<48`, `>72`): the 88-key piano. */
export const PIANO_LOW_MIDI = 21;
export const PIANO_HIGH_MIDI = 108;

/** Zones are inset from the plate edge so structures never overhang it. */
export const PLATE_INSET = 0.95;
/** Side of a layout grid cell and the jitter margin kept inside each cell (fraction of the cell). */
export const LAYOUT_CELL_SIZE = 0.4;
export const LAYOUT_CELL_MARGIN = 0.15;

/** Minimum growth time of a structure (requirement 3.5: `max(0.2, duration)`). */
export const MIN_GROW_SEC = 0.2;

/** Treble staff: bottom line E4, top line F5. `staffU` 0 = bottom line, 1 = top line. */
export const STAFF_BOTTOM_MIDI = 64;
export const STAFF_TOP_MIDI = 77;
export const STAFF_U_MIN = -0.75;
export const STAFF_U_MAX = 1.75;
/** Fraction of the staff where the playhead sits (notes slide from u = 1 down to it). */
export const STAFF_PLAYHEAD_U = 0.12;
/** Staff height above the plate and spacing between its 5 lines, as fractions of the plate size. */
export const STAFF_HEIGHT_RATIO = 0.06;
export const STAFF_LINE_GAP_RATIO = 0.012;
/** Aurora style (I6): the staff hangs high above the plate, its lines are wider apart, notes sway as they fall. */
export const AURORA_HEIGHT_RATIO = 0.14;
export const AURORA_GAP_FACTOR = 1.5;
export const AURORA_SWAY_RATIO = 0.02;
/** Peak of the falling arc above the straight line from staff to target, in metres. */
export const FALL_ARC_HEIGHT = 0.6;

/** Glyph by note duration in beats. */
export const QUARTER_MIN_BEATS = 0.75;
export const EIGHTH_MIN_BEATS = 0.375;

/** Base and extra height per kind; the extra part is scaled by the rule's `heightFrom` factor (0..1). */
export const KIND_HEIGHT: Readonly<Record<string, { base: number; extra: number }>> = {
  terrain_ridge: { base: 0.15, extra: 0.6 },
  building: { base: 0.35, extra: 1.6 },
  spike: { base: 0.8, extra: 2.6 },
  crystal: { base: 0.4, extra: 1.1 },
  cluster: { base: 0.25, extra: 0.7 },
};
export const RECIPE_HEIGHT = { base: 0.5, extra: 1.0 };
/** Default footprint of a recipe in metres (`ShapeRecipe.footprint`); `xr/constants.ts` mirrors it. */
export const RECIPE_FOOTPRINT_M = 0.25;

/**
 * Scenery (template `scenery`) is already standing at t = 0: its records landed this long before the song starts, so it
 * is fully grown and never visible on the staff or in the air.
 */
export const SCENERY_LANDED_AT = -3600;
export const SCENERY_VELOCITY_MIN = 0.35;
export const SCENERY_VELOCITY_MAX = 0.9;

/** Duration (beats) that maps to the full `duration` height factor. */
export const DURATION_FULL_BEATS = 4;
/** Emissive intensity = base + scale × velocity (requirement 3.5). */
export const EMISSIVE_BASE = 0.35;
export const EMISSIVE_VELOCITY_SCALE = 0.9;

/** Kick / beat light pulse decay (seconds, exponential time constant). */
export const PULSE_DECAY_SEC = 0.18;
/** Light arc fade-in and fade-out after its chord ends. */
export const ARC_FADE_SEC = 0.5;
