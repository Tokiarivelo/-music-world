/**
 * StructureSystem view (task 4.3, requirements 3.5, 5.1): one InstancedMesh per shape kind of the plan, one instance
 * slot per `SpawnRecord.slot`. Each frame, live structures write their slot (scale.y = growth × height, color =
 * palette role or gradient × emissive); slots without a live structure collapse to zero scale (seek backwards).
 */
import { Color, Group, InstancedMesh, Matrix4, MeshBasicMaterial, Quaternion, Vector3 } from 'three';
import type { SpawnPlan } from '@/engine/spawn-plan';
import type { ShapeKind } from '@/engine/types';
import type { WorldState } from '@/engine/world-state';
import { KIND_FOOTPRINT, RECIPE_FOOTPRINT } from '../constants';
import { structureColor } from '../palette';
import { buildShapeGeometry } from '../shapes/builtin-shapes';
import type { WorldView } from './world-view';

const MIN_SCALE = 1e-4;
const ZERO = new Matrix4().makeScale(0, 0, 0);

export function footprintOf(kind: ShapeKind): number {
  return KIND_FOOTPRINT[kind] ?? RECIPE_FOOTPRINT;
}

export class StructureView implements WorldView {
  readonly object = new Group();
  private readonly meshes = new Map<ShapeKind, InstancedMesh>();
  private readonly material = new MeshBasicMaterial({ color: 0xffffff });
  private readonly m = new Matrix4();
  private readonly q = new Quaternion();
  private readonly pos = new Vector3();
  private readonly scale = new Vector3();
  private readonly color = new Color();
  private lastT = Number.NaN;

  constructor(private readonly plan: SpawnPlan) {
    this.object.name = 'structures';
    for (const track of plan.tracks) {
      const capacity = Math.min(plan.budget, track.recordIndices.length);
      const mesh = new InstancedMesh(buildShapeGeometry(track.kind), this.material, capacity);
      mesh.name = `structures:${track.kind}`;
      mesh.frustumCulled = false; // instances grow from zero scale; the initial bounding sphere is empty
      for (let i = 0; i < capacity; i++) {
        mesh.setMatrixAt(i, ZERO);
        mesh.setColorAt(i, this.color.set(0, 0, 0));
      }
      this.meshes.set(track.kind, mesh);
      this.object.add(mesh);
    }
  }

  /** Number of InstancedMeshes (one draw call each). */
  drawCalls(): number {
    return this.meshes.size;
  }

  mesh(kind: ShapeKind): InstancedMesh | undefined {
    return this.meshes.get(kind);
  }

  update(state: WorldState): void {
    if (state.t === this.lastT) return; // paused: nothing changed, skip the GPU upload
    this.lastT = state.t;
    for (const mesh of this.meshes.values()) {
      for (let i = 0; i < mesh.count; i++) mesh.setMatrixAt(i, ZERO);
    }
    const palette = this.plan.template.palette;
    for (const s of state.structures) {
      const mesh = this.meshes.get(s.kind);
      if (!mesh || s.slot >= mesh.count) continue;
      const footprint = footprintOf(s.kind) * (0.6 + 0.4 * s.growth);
      this.scale.set(footprint, Math.max(MIN_SCALE, s.height), footprint);
      this.m.compose(this.pos.set(s.position.x, s.position.y, s.position.z), this.q, this.scale);
      mesh.setMatrixAt(s.slot, this.m);
      mesh.setColorAt(s.slot, structureColor(palette, s.colorRole, s.colorT, s.emissive, this.color));
    }
    for (const mesh of this.meshes.values()) {
      mesh.instanceMatrix.needsUpdate = true;
      if (mesh.instanceColor) mesh.instanceColor.needsUpdate = true;
    }
  }

  dispose(): void {
    for (const mesh of this.meshes.values()) mesh.geometry.dispose();
    this.material.dispose();
  }
}
