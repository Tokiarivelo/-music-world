/** Rendering constants (xr-iwsdk.md, tech.md perf budget). Distances in plate metres unless stated. */

/** Tabletop diorama in VR (~1.5 m wide), in front of the user at table height (xr-iwsdk.md). */
export const DIORAMA_WIDTH_M = 1.5;
export const DIORAMA_POSITION = { x: 0, y: 0.85, z: -1.3 } as const;
/**
 * Desktop isometric camera (04-default-template requirement 1): azimuth from the plate's front axis (+z) toward +x,
 * elevation above the plate, distance from the diorama centre in metres, vertical field of view.
 */
export const DESKTOP_CAMERA_AZIMUTH_DEG = 27;
export const DESKTOP_CAMERA_ELEVATION_DEG = 31;
export const DESKTOP_CAMERA_DISTANCE_M = 2.5;
export const DESKTOP_CAMERA_FOV_DEG = 20;
/** Point the desktop camera looks at, relative to the diorama centre (metres): slightly toward the city. */
export const DESKTOP_CAMERA_TARGET_OFFSET = { x: 0.0, y: 0.09, z: 0.0 } as const;

export const PLATE_THICKNESS = 0.35;
/** Grid cells per side of the plate top height field (2 triangles per cell). */
export const TERRAIN_GRID = 96;
/** Plate shading (sRGB-ish multipliers of `palette.terrain`): rim, centre, plate sides. */
export const PLATE_RIM_LIGHT = 1.0;
export const PLATE_CENTRE_LIGHT = 1.4;
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
export const CRACK_REST_MIX = 0.012;
export const CRACK_REST_LIGHT = 0.75;
export const CRACK_BASE_INTENSITY = 0.45;
export const CRACK_PULSE_INTENSITY = 1.2;

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
/** Additive halo tubes around the staff lines (fake bloom): radius in metres, opacity × `staff.glow`. */
export const STAFF_HALO_RADIUS = 0.045;
export const STAFF_HALO_OPACITY = 0.22;
/** Bravura G clef size in staff spaces per line gap. */
export const CLEF_SCALE = 1.25;

/** Bravura note glyph size: metres per staff space = line gap × this. */
export const GLYPH_SCALE = 1.2;
/** Halo quad behind each note glyph: opacity × `staff.glow`. */
export const GLYPH_HALO_OPACITY = 0.55;
export const GLYPH_CAPACITY_MAX = 512;

/** Footprint (x and z scale) of one structure instance per kind. */
export const KIND_FOOTPRINT: Readonly<Record<string, number>> = {
  terrain_ridge: 0.9,
  building: 0.24,
  spike: 0.8,
  crystal: 0.2,
  cluster: 0.22,
};
export const RECIPE_FOOTPRINT = 0.25;

/** Building windows (04-default-template requirement 5.1): window cell in metres, lit share, colors. */
export const BUILDING_WINDOW_SIZE = { w: 0.075, h: 0.09 } as const;
export const BUILDING_WINDOW_LIT_RATE = 0.55;
/** Lit window color: instance tint mixed toward white by this amount. */
export const BUILDING_WINDOW_WHITE = 0.72;
/** Wall and roof brightness relative to the instance tint (linear). */
export const BUILDING_WALL_LIGHT = 0.12;
export const BUILDING_ROOF_LIGHT = 0.55;
/** Triangle budget per instanced shape (one instance). */
export const SHAPE_TRIANGLE_BUDGET = 600;

export const ARC_CAPACITY_MAX = 256;
export const ARC_HEIGHT_RATIO = 0.12;
/** Chord arc apex height bounds (m). */
export const ARC_HEIGHT_MIN = 0.12;
export const ARC_HEIGHT_MAX = 0.7;
/** Chord light arcs: tube radius (m, before stretching) and opacity factor. */
export const CHORD_ARC_RADIUS = 0.006;
export const CHORD_ARC_OPACITY = 0.6;
/** Decorative arcs around the staff (04-default-template requirement 6.1): count, height above the plate, radius. */
export const DECOR_ARC_COUNT = 6;
export const DECOR_ARC_LIFT = 0.04;
export const DECOR_ARC_RADIUS = 0.008;
/** Particles (requirement 6.2): count, share on the decor arcs, max height (m), point size (camera metres). */
export const PARTICLE_COUNT = 160;
export const PARTICLE_ARC_SHARE = 0.6;
export const PARTICLE_HEIGHT = 1.2;
export const PARTICLE_SIZE = 0.07;
/** Particle drift speed (radians per song second) — derived from t, never from frame deltas. */
export const PARTICLE_SPIN = 0.002;

/** VR tabletop placement (07-xr-mode requirement 2): head → plate centre distance on the floor, plate top height. */
export const VR_DIORAMA_DISTANCE_M = 1.3;
export const VR_TABLE_HEIGHT_M = DIORAMA_POSITION.y;
/** A head pose lower than this (m above the floor) is not tracked yet: wait before placing the plate. */
export const VR_MIN_HEAD_HEIGHT_M = 0.3;
/** Thumbstick seek step in VR (07-xr-mode requirement 3.2), same as the keyboard arrows. */
export const VR_SEEK_STEP_SEC = 5;
