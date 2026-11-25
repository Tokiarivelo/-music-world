/**
 * StructureSystem view (task 4.3, requirements 3.5, 5.1): one InstancedMesh per shape kind of the plan, one instance
 * slot per `SpawnRecord.slot`. Each frame, live structures write their slot (scale.y = growth × height, color =
 * palette role or gradient × emissive); slots without a live structure collapse to zero scale (seek backwards).
 */
import {
  Color,
  Group,
  InstancedMesh,
  Matrix4,
  MeshBasicMaterial,
  PlaneGeometry,
  Quaternion,
  Vector3,
  type DataTexture,
  type Material,
  type MeshStandardMaterial,
} from 'three';
import { isRecordShown } from '@/engine/layers';
import { objectPoseAt } from '@/engine/motion';
import type { SpawnPlan } from '@/engine/spawn-plan';
import { recipeScale } from '@/engine/recipe-scale';
import type { ShapeKind, WorldTemplate } from '@/engine/types';
import type { WorldState } from '@/engine/world-state';
import { layerStore } from '../layer-store';
import { KIND_HEIGHT, RECIPE_HEIGHT } from '@/engine/constants';
import { KIND_FOOTPRINT, RECIPE_FOOTPRINT } from '../constants';
import { lightness, structureColor } from '../palette';
import { buildShapeGeometry } from '../shapes/builtin-shapes';
import { fitModel, hasModel, loadModelGeometry, MODEL_VARIANTS, MODELS, variantOf } from '../shapes/model-catalog';
import { withLitAttributes } from '../shapes/lit-geometry';
import {
  applyDetailMaps,
  applySky,
  isPolishedKind,
  loadDetailMaps,
  loadSkyEnvironment,
  polishedMaterial,
  TEXTURE_SET,
} from '../shapes/polished-materials';
import { blobShadowMaterial, blobShadowTexture, buildingMaterial, foliageMaterial, spikeMaterial } from '../shapes/city-materials';
import type { WorldView } from './world-view';

const MIN_SCALE = 1e-4;
const RIDGE_KIND: ShapeKind = 'terrain_ridge';
const RIDGE_PRIMARY_MIX = 0;
const RIDGE_LIGHT = 1.2;
/** Equalizer needles are additive and thin: boost their instance color so they read as light (requirement 5.2). */
const SPIKE_GLOW = 2.2;
const UP = new Vector3(0, 1, 0);
/** Objects (I8) that cast a blob shadow, and the foliage that sways in the wind. */
const SHADOW_KINDS: ReadonlySet<string> = new Set(['tree', 'conifer', 'bush', 'car', 'bicycle', 'airplane', 'cloud']);
const FOLIAGE_KINDS: ReadonlySet<string> = new Set(['tree', 'conifer', 'bush']);
/** Lit materials are shaded darker than unlit colors: lift the tint, and the sky reflection, to the same brightness. */
const POLISH_GAIN = 1.9;
const POLISH_REFLECTION = 2.2;
const SHADOW_OPACITY = 0.45;
const SHADOW_SIZE = 1.5; // shadow diameter / footprint
const SHADOW_LIFT = 0.004; // above the plate, against z-fighting
const SHADOW_SKY_SPREAD = 1.8; // sky objects: bigger and fainter
const FLAT = new Quaternion().setFromAxisAngle(new Vector3(1, 0, 0), -Math.PI / 2);
const ZERO = new Matrix4().makeScale(0, 0, 0);

export function footprintOf(kind: ShapeKind, template?: WorldTemplate): number {
  if (KIND_FOOTPRINT[kind] !== undefined) return KIND_FOOTPRINT[kind];
  return template ? recipeScale(template, kind).footprint : RECIPE_FOOTPRINT;
}

/** Instance height (m) of a kind before the per-note factor: what `engine/spawn-plan.ts` uses as base + extra / 2. */
function nominalHeightOf(kind: ShapeKind, template: WorldTemplate): number {
  const { base, extra } = KIND_HEIGHT[kind] ?? RECIPE_HEIGHT;
  const scale = kind.startsWith('recipe:') ? recipeScale(template, kind).heightScale : 1;
  return (base + extra / 2) * scale;
}

export class StructureView implements WorldView {
  readonly object = new Group();
  private readonly meshes = new Map<ShapeKind, InstancedMesh>();
  /** Extra InstancedMeshes of the body variants of a kind (models loaded for polished worlds only), same slots. */
  private readonly variantMeshes = new Map<ShapeKind, InstancedMesh[]>();
  private readonly materials = new Map<ShapeKind, Material>();
  private disposed = false;
  private readonly litKinds = new Set<ShapeKind>();
  private readonly ridgeColor: Color;
  private readonly m = new Matrix4();
  private readonly q = new Quaternion();
  private readonly pos = new Vector3();
  private readonly scale = new Vector3();
  private readonly color = new Color();
  private shadows: InstancedMesh | null = null;
  private shadowMap: DataTexture | null = null;
  private lastT = Number.NaN;
  private readonly unsubscribe: () => void;

  constructor(private readonly plan: SpawnPlan) {
    this.object.name = 'structures';
    this.unsubscribe = layerStore.subscribe(() => {
      this.lastT = Number.NaN; // redraw at once, even while paused
    });
    const { palette } = plan.template;
    // Ridges are mountains: terrain hue (lifted toward the primary), not the pitch gradient (requirement 2.4).
    this.ridgeColor = new Color(palette.terrain)
      .lerp(new Color(palette.primary), RIDGE_PRIMARY_MIX)
      .multiplyScalar(lightness(RIDGE_LIGHT));
    const polished = plan.template.fx.material === 'polished';
    for (const track of plan.tracks) {
      const capacity = Math.min(plan.budget, track.recordIndices.length);
      const built = buildShapeGeometry(track.kind, plan.template.recipes);
      const lit = polished && isPolishedKind(track.kind);
      const geometry = lit ? withLitAttributes(built) : built;
      if (geometry !== built) built.dispose();
      const material: Material =
        track.kind === 'building'
          ? buildingMaterial()
          : track.kind === 'spike'
            ? spikeMaterial()
            : lit
              ? polishedMaterial(track.kind, geometry.hasAttribute('color'), null, POLISH_REFLECTION)
              : FOLIAGE_KINDS.has(track.kind)
                ? foliageMaterial()
                : new MeshBasicMaterial({ color: 0xffffff, vertexColors: geometry.hasAttribute('color') });
      this.materials.set(track.kind, material);
      if (lit) this.litKinds.add(track.kind);
      const mesh = new InstancedMesh(geometry, material, capacity);
      mesh.name = `structures:${track.kind}`;
      mesh.frustumCulled = false; // instances grow from zero scale; the initial bounding sphere is empty
      for (let i = 0; i < capacity; i++) {
        mesh.setMatrixAt(i, ZERO);
        mesh.setColorAt(i, this.color.set(0, 0, 0));
      }
      this.meshes.set(track.kind, mesh);
      this.object.add(mesh);
    }
    this.addShadows();
    if (polished) {
      for (const kind of this.litKinds) {
        if (hasModel(kind)) this.useModel(kind);
        const set = TEXTURE_SET[kind];
        const material = this.materials.get(kind) as MeshStandardMaterial;
        if (set) {
          void loadDetailMaps(set).then((maps) => {
            if (maps && !this.disposed) applyDetailMaps(material, maps);
          });
        }
      }
      void loadSkyEnvironment().then((sky) => {
        if (!sky || this.disposed) return;
        for (const material of this.materials.values()) if ((material as MeshStandardMaterial).isMeshStandardMaterial) applySky(material as MeshStandardMaterial, sky);
      });
    }
  }

  /** Swaps the procedural shape of `kind` for its authored model when the file has loaded. */
  private useModel(kind: ShapeKind): void {
    void loadModelGeometry(kind).then((raw) => {
      const mesh = this.meshes.get(kind);
      if (!raw || !mesh || this.disposed) return;
      const fitted = fitModel(raw, MODELS[kind]!, footprintOf(kind, this.plan.template), nominalHeightOf(kind, this.plan.template));
      const geometry = withLitAttributes(fitted);
      if (geometry !== fitted) fitted.dispose();
      const old = mesh.geometry;
      mesh.geometry = geometry;
      old.dispose();
      const material = this.materials.get(kind) as MeshStandardMaterial;
      material.vertexColors = geometry.hasAttribute('color');
      material.needsUpdate = true;
      this.lastT = Number.NaN; // redraw at once, even while paused
    });
    this.addVariants(kind);
  }

  /** Body variants (cars: coupe and retro): one more InstancedMesh each, sharing the kind's material and slots. */
  private addVariants(kind: ShapeKind): void {
    const files = MODEL_VARIANTS[kind];
    const base = this.meshes.get(kind);
    if (!files || !base) return;
    const list: InstancedMesh[] = [];
    for (const file of files) {
      const mesh = new InstancedMesh(base.geometry, base.material, base.instanceMatrix.count);
      mesh.name = `structures:${kind}:${file}`;
      mesh.frustumCulled = false;
      for (let i = 0; i < mesh.instanceMatrix.count; i++) {
        mesh.setMatrixAt(i, ZERO);
        mesh.setColorAt(i, this.color.set(0, 0, 0));
      }
      mesh.count = base.count;
      list.push(mesh);
      this.object.add(mesh);
      void loadModelGeometry(file).then((raw) => {
        if (!raw || this.disposed) return;
        const fitted = fitModel(raw, MODELS[file]!, footprintOf(kind, this.plan.template), nominalHeightOf(kind, this.plan.template));
        const geometry = withLitAttributes(fitted);
        if (geometry !== fitted) fitted.dispose();
        mesh.geometry = geometry;
        this.lastT = Number.NaN;
      });
    }
    this.variantMeshes.set(kind, list);
  }

  /** The InstancedMesh that draws instance `slot` of `kind` (the kind's own mesh, or one of its body variants). */
  private meshFor(kind: ShapeKind, slot: number): InstancedMesh | undefined {
    const base = this.meshes.get(kind);
    const v = variantOf(kind, slot);
    return v === 0 || !base ? base : (this.variantMeshes.get(kind)?.[v - 1] ?? base);
  }

  /** One extra InstancedMesh (one draw call) of blob shadows under every object of the kinds above. */
  private addShadows(): void {
    const capacity = this.plan.tracks
      .filter((t) => SHADOW_KINDS.has(t.kind))
      .reduce((n, t) => n + Math.min(this.plan.budget, t.recordIndices.length), 0);
    if (capacity === 0) return;
    this.shadowMap = blobShadowTexture();
    const geometry = new PlaneGeometry(1, 1);
    const mesh = new InstancedMesh(geometry, blobShadowMaterial(this.shadowMap, SHADOW_OPACITY), capacity);
    mesh.name = 'structures:shadows';
    mesh.frustumCulled = false;
    mesh.count = 0;
    this.shadows = mesh;
    this.object.add(mesh);
  }

  /** Number of InstancedMeshes (one draw call each). */
  drawCalls(): number {
    let variants = 0;
    for (const list of this.variantMeshes.values()) variants += list.length;
    return this.meshes.size + variants + (this.shadows ? 1 : 0);
  }

  mesh(kind: ShapeKind): InstancedMesh | undefined {
    return this.meshes.get(kind);
  }

  update(state: WorldState): void {
    if (state.t === this.lastT) return; // paused: nothing changed, skip the GPU upload
    this.lastT = state.t;
    for (const mesh of [...this.meshes.values(), ...[...this.variantMeshes.values()].flat()]) {
      for (let i = 0; i < mesh.count; i++) mesh.setMatrixAt(i, ZERO);
    }
    const palette = this.plan.template.palette;
    const hidden = layerStore.hidden;
    for (const material of this.materials.values()) {
      const time = material.userData.mwTime as { value: number } | undefined;
      if (time) time.value = state.t;
    }
    let shadowCount = 0;
    for (const s of state.structures) {
      if (!isRecordShown(this.plan, s.index, hidden)) continue;
      const mesh = this.meshFor(s.kind, s.slot);
      if (!mesh || s.slot >= mesh.count) continue;
      const footprint = footprintOf(s.kind, this.plan.template) * (0.6 + 0.4 * s.growth);
      this.scale.set(footprint, Math.max(MIN_SCALE, s.height), footprint);
      const pose = objectPoseAt(s.kind, this.plan.seed, s.index, state.t, this.plan.template.terrain.size);
      if (pose) this.q.setFromAxisAngle(UP, -pose.yaw);
      else this.q.identity();
      this.m.compose(
        pose ? this.pos.set(pose.x, pose.y, pose.z) : this.pos.set(s.position.x, s.position.y, s.position.z),
        this.q,
        this.scale,
      );
      mesh.setMatrixAt(s.slot, this.m);
      if (this.shadows && SHADOW_KINDS.has(s.kind) && shadowCount < this.shadows.instanceMatrix.count) {
        const sky = pose ? pose.y > 1 : false;
        const d = footprint * SHADOW_SIZE * (sky ? SHADOW_SKY_SPREAD : 1);
        this.scale.set(d, d, 1);
        this.m.compose(this.pos.set(this.m.elements[12]!, SHADOW_LIFT, this.m.elements[14]!), FLAT, this.scale);
        this.shadows.setMatrixAt(shadowCount++, this.m);
      }
      if (s.kind === RIDGE_KIND) mesh.setColorAt(s.slot, this.color.copy(this.ridgeColor));
      else {
        if (s.structureHex) this.color.set(s.structureHex).multiplyScalar(s.emissive);
        else structureColor(palette, s.colorRole, s.colorT, s.emissive, this.color);
        if (this.litKinds.has(s.kind)) this.color.multiplyScalar(POLISH_GAIN);
        mesh.setColorAt(s.slot, s.kind === 'spike' ? this.color.multiplyScalar(SPIKE_GLOW) : this.color);
      }
    }
    if (this.shadows) {
      this.shadows.count = shadowCount;
      this.shadows.instanceMatrix.needsUpdate = true;
    }
    for (const mesh of [...this.meshes.values(), ...[...this.variantMeshes.values()].flat()]) {
      mesh.instanceMatrix.needsUpdate = true;
      if (mesh.instanceColor) mesh.instanceColor.needsUpdate = true;
    }
  }

  dispose(): void {
    this.disposed = true;
    this.unsubscribe();
    for (const mesh of [...this.meshes.values(), ...[...this.variantMeshes.values()].flat()]) mesh.geometry.dispose();
    for (const material of this.materials.values()) material.dispose();
    if (this.shadows) {
      this.shadows.geometry.dispose();
      (this.shadows.material as MeshBasicMaterial).dispose();
    }
    this.shadowMap?.dispose();
  }
}
