import type { Object3D } from 'three';
import type { WorldState } from '@/engine/world-state';

/** One renderable layer of the world: built once from a plan, updated from `worldStateAt(plan, t)` each frame. */
export interface WorldView {
  readonly object: Object3D;
  update(state: WorldState): void;
  dispose(): void;
}
