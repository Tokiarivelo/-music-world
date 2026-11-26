/**
 * World scale (I7): how big the plate is around the viewer. View state only: `worldStateAt` and the layout keep their
 * normalized units; the scene root is scaled and the environment follows, so the same plan can be a table-top diorama
 * or a world the viewer stands in (eye at 1.6 m on the plate, buildings several times taller).
 */
import {
  CAMERA_FAR_M,
  DIORAMA_POSITION,
  DIORAMA_WIDTH_M,
  ENV_FOG_FAR_M,
  ENV_FOG_NEAR_M,
  IMMERSIVE_CAMERA_FAR_M,
  IMMERSIVE_ENV_SCALE,
  IMMERSIVE_OBJECT_SCALE,
  IMMERSIVE_PLATE_M,
  IMMERSIVE_START_Z_M,
} from './constants';
import type { Vec3 } from './navigation/orbit-camera';

export type ScaleMode = 'diorama' | 'immersive';

export interface Placement {
  x: number;
  y: number;
  z: number;
}

/** Width of the plate in metres. */
export function plateWidthM(mode: ScaleMode): number {
  return mode === 'immersive' ? IMMERSIVE_PLATE_M : DIORAMA_WIDTH_M;
}

/** Scale of the scene root: plate metres (template units) to world metres. */
export function rootScale(mode: ScaleMode, terrainSize: number): number {
  const wide = mode === 'immersive' ? 1 : span; // the big world keeps the object size; the table-top diorama fits the whole city
  return plateWidthM(mode) / ((terrainSize > 0 ? terrainSize : 1) * wide);
}

/** How many plates wide the world is (a city is wider than its plate); set when a scene is loaded. */
let span = 1;
export function setWorldSpan(value: number): void {
  span = value >= 1 ? value : 1;
}

/** Width of the area the viewer can walk, in metres. */
export function worldWidthM(mode: ScaleMode): number {
  return plateWidthM(mode) * span;
}

/** Size factor of instances: in the wide immersive plate objects keep their calibrated size (see `IMMERSIVE_OBJECT_SCALE`). */
export function objectScale(mode: ScaleMode): number {
  return mode === 'immersive' ? IMMERSIVE_OBJECT_SCALE : 1;
}

/** Where the plate centre sits. Immersive: the plate top is the floor and the viewer starts inside its near edge. */
export function anchorPlacement(mode: ScaleMode): Placement {
  return mode === 'immersive' ? { x: 0, y: 0, z: -IMMERSIVE_START_Z_M } : { ...DIORAMA_POSITION };
}

/** Scale of the environment (ground, hills): the horizon has to stay beyond the plate. */
export function environmentScale(mode: ScaleMode): number {
  return mode === 'immersive' ? IMMERSIVE_ENV_SCALE : 1;
}

export function fogRange(mode: ScaleMode): { near: number; far: number } {
  const k = environmentScale(mode);
  return { near: ENV_FOG_NEAR_M * k, far: ENV_FOG_FAR_M * k };
}

export function cameraFar(mode: ScaleMode): number {
  return mode === 'immersive' ? IMMERSIVE_CAMERA_FAR_M : CAMERA_FAR_M;
}

/**
 * The orbit camera (explore and cinematic views) is tuned in diorama metres. In the immersive scale (dome world) the
 * same pose is mapped to the big world: relative to the plate centre, multiplied by the plate width ratio.
 */
export const VIEW_SCALE = IMMERSIVE_PLATE_M / DIORAMA_WIDTH_M;

export function viewToWorld(p: Vec3, mode: ScaleMode, out: Vec3 = { x: 0, y: 0, z: 0 }): Vec3 {
  if (mode !== 'immersive') {
    out.x = p.x;
    out.y = p.y;
    out.z = p.z;
    return out;
  }
  const at = anchorPlacement('immersive');
  out.x = at.x + (p.x - DIORAMA_POSITION.x) * VIEW_SCALE;
  out.y = at.y + (p.y - DIORAMA_POSITION.y) * VIEW_SCALE;
  out.z = at.z + (p.z - DIORAMA_POSITION.z) * VIEW_SCALE;
  return out;
}

type Listener = (mode: ScaleMode) => void;

/** Shared scale mode of one page (one music world per page): views subscribe instead of being rebuilt. */
class ScaleStore {
  private current: ScaleMode = 'diorama';
  private readonly listeners = new Set<Listener>();
  private boost = 1;
  private readonly boostListeners = new Set<(boost: number) => void>();

  get mode(): ScaleMode {
    return this.current;
  }

  /** Fog distance multiplier (>= 1): the explore camera floats far above the plate, the fog must not swallow it. */
  get fogBoost(): number {
    return this.boost;
  }

  setFogBoost(boost: number): void {
    const next = Math.max(1, Math.round(boost * 20) / 20);
    if (next === this.boost) return;
    this.boost = next;
    for (const listener of this.boostListeners) listener(next);
  }

  onFogBoost(listener: (boost: number) => void): () => void {
    this.boostListeners.add(listener);
    return () => {
      this.boostListeners.delete(listener);
    };
  }

  set(mode: ScaleMode): void {
    if (mode === this.current) return;
    this.current = mode;
    for (const listener of this.listeners) listener(mode);
  }

  subscribe(listener: Listener): () => void {
    this.listeners.add(listener);
    return () => {
      this.listeners.delete(listener);
    };
  }
}

export const scaleStore = new ScaleStore();
