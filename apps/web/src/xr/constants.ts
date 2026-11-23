/** Rendering constants (xr-iwsdk.md, tech.md perf budget). Distances in plate metres unless stated. */

/** Tabletop diorama in VR (~1.5 m wide), in front of the user at table height (xr-iwsdk.md). */
export const DIORAMA_WIDTH_M = 1.5;
export const DIORAMA_POSITION = { x: 0, y: 0.85, z: -1.3 } as const;
/**
 * Desktop isometric camera (04-default-template requirement 1): azimuth from the plate's front axis (+z) toward +x,
 * elevation above the plate, distance from the diorama centre in metres, vertical field of view.
 */
export const DESKTOP_CAMERA_AZIMUTH_DEG = 22;
export const DESKTOP_CAMERA_ELEVATION_DEG = 35;
export const DESKTOP_CAMERA_DISTANCE_M = 2.9;
export const DESKTOP_CAMERA_FOV_DEG = 20;
/** Point the desktop camera looks at, relative to the diorama centre (metres): slightly toward the city. */
export const DESKTOP_CAMERA_TARGET_OFFSET = { x: 0.05, y: 0.05, z: 0.02 } as const;

export const PLATE_THICKNESS = 0.35;
/** Grid cells per side of the plate top height field (2 triangles per cell). */
export const TERRAIN_GRID = 96;
/** Plate shading (sRGB-ish multipliers of `palette.terrain`): rim, centre, plate sides. */
export const PLATE_RIM_LIGHT = 1.0;
export const PLATE_CENTRE_LIGHT = 1.7;
export const PLATE_SIDE_LIGHT = 0.55;
/** Cool (secondary) tint of the plate centre, like the blue-grey middle of the reference plate. */
export const PLATE_CENTRE_COOL = 0.025;
/** Violet tint of the plate near the city (fraction of `palette.primary`). */
export const PLATE_CITY_TINT = 0.05;
/** Baked light direction for mountain faces (unlit materials: the look does not depend on scene lights). */
export const TERRAIN_LIGHT_DIRECTION = { x: -0.5, y: 0.75, z: 0.45 } as const;

/** Crack network: cell size (m), wobble of each edge midpoint (fraction of a cell), dropped edges, diagonals. */
export const CRACK_CELL_SIZE = 0.48;
export const CRACK_WOBBLE = 0.18;
export const CRACK_DROP_RATE = 0.12;
export const CRACK_DIAGONAL_RATE = 0.22;
export const CRACK_LIFT = 0.004;
/** Cracks are not drawn where the height field is above this (mountains). */
export const CRACK_MAX_FIELD_HEIGHT = 0.03;
/** Crack glow: rest color mix toward `palette.staff`, rest and kick pulse intensities. */
export const CRACK_REST_MIX = 0.06;
export const CRACK_BASE_INTENSITY = 0.45;
export const CRACK_PULSE_INTENSITY = 1.6;

/** Edge mountains: clusters, peaks per cluster, inset from the edge, peak radius and height (metres). */
export const MOUNTAIN_CLUSTER_COUNT = 9;
export const MOUNTAIN_PEAKS: readonly [number, number] = [3, 5];
export const MOUNTAIN_INSET: readonly [number, number] = [0.5, 1.3];
export const MOUNTAIN_RADIUS: readonly [number, number] = [0.55, 1.1];
export const MOUNTAIN_HEIGHT: readonly [number, number] = [0.3, 0.75];
/** Mountains fade to zero over this distance from the plate rim. */
export const MOUNTAIN_EDGE_FADE = 0.35;

export const STAFF_TUBE_RADIUS = 0.012;
export const STAFF_TUBE_SEGMENTS = 96;
export const CLEF_TUBE_RADIUS = 0.018;

/** Glyph size relative to the staff line gap. */
export const GLYPH_HEAD_SCALE = 1.25;
export const GLYPH_CAPACITY_MAX = 512;

/** Footprint (x and z scale) of one structure instance per kind. */
export const KIND_FOOTPRINT: Readonly<Record<string, number>> = {
  terrain_ridge: 0.9,
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
