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
  IMMERSIVE_PLATE_M,
  IMMERSIVE_START_Z_M,
} from './constants';

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
  return plateWidthM(mode) / (terrainSize > 0 ? terrainSize : 1);
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

type Listener = (mode: ScaleMode) => void;

/** Shared scale mode of one page (one music world per page): views subscribe instead of being rebuilt. */
class ScaleStore {
  private current: ScaleMode = 'diorama';
  private readonly listeners = new Set<Listener>();

  get mode(): ScaleMode {
    return this.current;
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
