/** Rendering constants (xr-iwsdk.md, tech.md perf budget). Distances in plate metres unless stated. */

/** Tabletop diorama in VR (~1.5 m wide), in front of the user at table height (xr-iwsdk.md). */
export const DIORAMA_WIDTH_M = 1.5;
export const DIORAMA_POSITION = { x: 0, y: 0.85, z: -1.3 } as const;
/** Desktop isometric camera: direction from the diorama centre, distance in metres, vertical field of view. */
export const DESKTOP_CAMERA_DIRECTION = { x: 0.5, y: 0.9, z: 1 } as const;
export const DESKTOP_CAMERA_DISTANCE_M = 2.4;
export const DESKTOP_CAMERA_FOV_DEG = 35;

export const PLATE_THICKNESS = 0.35;
export const CRACK_COUNT = 70;
export const CRACK_SEGMENTS = 6;
export const CRACK_BASE_INTENSITY = 0.25;
export const CRACK_PULSE_INTENSITY = 1.6;
export const MOUNTAIN_COUNT = 46;

export const STAFF_TUBE_RADIUS = 0.012;
export const STAFF_TUBE_SEGMENTS = 96;
export const CLEF_TUBE_RADIUS = 0.018;

/** Glyph size relative to the staff line gap. */
export const GLYPH_HEAD_SCALE = 1.25;
export const GLYPH_CAPACITY_MAX = 512;

/** Footprint (x and z scale) of one structure instance per kind. */
export const KIND_FOOTPRINT: Readonly<Record<string, number>> = {
  terrain_ridge: 0.55,
  building: 0.26,
  spike: 0.09,
  crystal: 0.2,
  cluster: 0.22,
};
export const RECIPE_FOOTPRINT = 0.25;
/** Triangle budget per instanced shape (one instance). */
export const SHAPE_TRIANGLE_BUDGET = 600;

export const ARC_CAPACITY_MAX = 256;
export const ARC_HEIGHT_RATIO = 0.35;
export const DECOR_ARC_COUNT = 4;
export const PARTICLE_COUNT = 300;
export const PARTICLE_HEIGHT = 2.5;
/** Particle drift speed (radians per song second) — derived from t, never from frame deltas. */
export const PARTICLE_SPIN = 0.02;
