/**
 * Objects on every horizon: a static ring of trees, bushes, rocks or reef (the static kinds of the template's scenery)
 * scattered around the plate over the whole landscape, in clumps like forests, so the world does not end at the edge of
 * the plate. View only: placed from the world seed, never read by `worldStateAt`. One InstancedMesh per kind (at most
 * `MAX_KINDS`), unlit (colors baked in the vertices), fogged with the environment. Fixed in the world like the environment and
 * scaled with the plate (`plateWidthM`), so on the table-top diorama it is a miniature backdrop.
 */
import {
  Color,
  DynamicDrawUsage,
  Group,
  InstancedMesh,
  Matrix4,
  MeshBasicMaterial,
  Quaternion,
  Vector3,
  type BufferGeometry,
} from 'three';
import { KIND_HEIGHT, RECIPE_HEIGHT } from '@/engine/constants';
import { MOVING_KINDS } from '@/engine/motion';
import { hashSeed, mulberry32, type Rng } from '@/engine/prng';
import { recipeScale } from '@/engine/recipe-scale';
import type { SpawnPlan } from '@/engine/spawn-plan';
import type { ShapeKind } from '@/engine/types';
import { IMMERSIVE_PLATE_M, KIND_FOOTPRINT, RECIPE_FOOTPRINT, ENV_GROUND_RADIUS_M, IMMERSIVE_ENV_SCALE } from '../constants';
import { roleColor } from '../palette';
import { anchorPlacement, plateWidthM, rootScale, scaleStore, type ScaleMode } from '../scale';
import { buildShapeGeometry } from '../shapes/builtin-shapes';
import type { WorldView } from './world-view';

/** Instances over all kinds, and the most kinds drawn (one draw call each). */
export const HORIZON_BUDGET = { instances: 720, kinds: 8 } as const;
/** Trees, bushes and rocks of a template without scenery of its own. */
const FALLBACK_KINDS: readonly ShapeKind[] = ['tree', 'conifer', 'bush'];
/** Sea creatures that swim above the seabed instead of standing on it (underwater templates only). */
const SWIMMERS: ReadonlySet<string> = new Set([
  'whale', 'shark', 'manta_ray', 'dolphin', 'jellyfish', 'fish_school', 'clownfish', 'seahorse', 'sea_turtle',
].map((n) => `recipe:${n}`));
/** Kinds that need the plate's own place (they are the stage, not the backdrop). */
const SKIPPED: ReadonlySet<string> = new Set(['building', 'cloud', ...MOVING_KINDS]);
/** The inner edge (m from the plate centre, in the big world): the plate is 80 m wide. */
const INNER_M = IMMERSIVE_PLATE_M / 2 + 8;
/** The ground disc is centred on the world origin, the plate 30 m off it: stay well inside. */
const OUTER_M = ENV_GROUND_RADIUS_M * IMMERSIVE_ENV_SCALE - 40;
const CLUMPS = 16;

export function horizonKinds(plan: SpawnPlan): ShapeKind[] {
  const kinds = [...new Set(plan.template.scenery.map((s) => s.kind))].filter((k) => !SKIPPED.has(k));
  return (kinds.length ? kinds : [...FALLBACK_KINDS]).slice(0, HORIZON_BUDGET.kinds);
}

function sizeOf(kind: ShapeKind, plan: SpawnPlan): { width: number; height: number } {
  const unit = rootScale('immersive', plan.template.terrain.size);
  const scale = kind.startsWith('recipe:') ? recipeScale(plan.template, kind) : null;
  const footprint = KIND_FOOTPRINT[kind] ?? scale?.footprint ?? RECIPE_FOOTPRINT;
  const { base, extra } = KIND_HEIGHT[kind] ?? RECIPE_HEIGHT;
  const nominal = (base + extra / 2) * (scale?.heightScale ?? 1);
  return { width: footprint * unit, height: nominal * unit };
}

/** One position of the ring: clumps with gaussian spread plus a lighter uniform sprinkle, outside the plate square. */
export function horizonPosition(rng: Rng, clumps: readonly { x: number; z: number; r: number }[]): { x: number; z: number } {
  for (let attempt = 0; attempt < 12; attempt += 1) {
    let x: number;
    let z: number;
    if (rng() < 0.7) {
      const c = clumps[Math.floor(rng() * clumps.length)]!;
      const a = rng() * Math.PI * 2;
      const d = c.r * Math.sqrt(-2 * Math.log(Math.max(1e-6, rng())));
      x = c.x + Math.cos(a) * d;
      z = c.z + Math.sin(a) * d;
    } else {
      const a = rng() * Math.PI * 2;
      const d = INNER_M + (OUTER_M - INNER_M) * Math.sqrt(rng());
      x = Math.cos(a) * d;
      z = Math.sin(a) * d;
    }
    const r = Math.hypot(x, z);
    // `z` is relative to the plate centre; keep out of the plate square and inside the landscape.
    if (Math.max(Math.abs(x), Math.abs(z)) >= INNER_M && r <= OUTER_M) return { x, z };
  }
  const a = rng() * Math.PI * 2;
  return { x: Math.cos(a) * OUTER_M * 0.8, z: Math.sin(a) * OUTER_M * 0.8 };
}

export class HorizonView implements WorldView {
  readonly object = new Group();
  private readonly meshes: InstancedMesh[] = [];
  private readonly geometries: BufferGeometry[] = [];
  private readonly material = new MeshBasicMaterial({ vertexColors: true });
  private readonly off: () => void;

  constructor(plan: SpawnPlan) {
    this.object.name = 'horizon';
    const kinds = horizonKinds(plan);
    const underwater = plan.template.fx.environment === 'underwater';
    const rng = mulberry32(hashSeed(plan.seed, 'horizon'));
    const clumps = Array.from({ length: CLUMPS }, () => {
      const a = rng() * Math.PI * 2;
      const d = INNER_M + (OUTER_M - INNER_M) * (0.15 + 0.8 * rng());
      return { x: Math.cos(a) * d, z: Math.sin(a) * d, r: 9 + 16 * rng() };
    });
    const per = Math.floor(HORIZON_BUDGET.instances / kinds.length);
    const m = new Matrix4();
    const q = new Quaternion();
    const up = new Vector3(0, 1, 0);
    const pos = new Vector3();
    const sc = new Vector3();
    const color = new Color();
    const roles = ['primary', 'secondary', 'accent'] as const;
    for (const kind of kinds) {
      const geometry = buildShapeGeometry(kind, plan.template.recipes);
      this.geometries.push(geometry);
      const mesh = new InstancedMesh(geometry, this.material, per);
      mesh.instanceMatrix.setUsage(DynamicDrawUsage);
      mesh.frustumCulled = false;
      const { width, height } = sizeOf(kind, plan);
      const swims = underwater && SWIMMERS.has(kind);
      const tinted = kind.startsWith('recipe:') || !['tree', 'conifer', 'bush'].includes(kind);
      for (let i = 0; i < per; i += 1) {
        const { x, z } = horizonPosition(rng, clumps);
        const size = 0.7 + 0.7 * rng();
        q.setFromAxisAngle(up, rng() * Math.PI * 2);
        pos.set(x, swims ? 4 + 22 * rng() : 0, z);
        sc.set(width * size, height * size, width * size);
        m.compose(pos, q, sc);
        mesh.setMatrixAt(i, m);
        if (tinted) roleColor(plan.template.palette, roles[Math.floor(rng() * roles.length)]!, color);
        else color.setRGB(0.8 + 0.2 * rng(), 0.85 + 0.15 * rng(), 0.8 + 0.2 * rng());
        mesh.setColorAt(i, color);
      }
      mesh.instanceMatrix.needsUpdate = true;
      if (mesh.instanceColor) mesh.instanceColor.needsUpdate = true;
      this.meshes.push(mesh);
      this.object.add(mesh);
    }
    this.apply(scaleStore.mode);
    this.off = scaleStore.subscribe((mode) => this.apply(mode));
  }

  /** Same centre and ratio as the plate: the backdrop is part of the world at whatever scale it is shown. */
  private apply(mode: ScaleMode): void {
    const at = anchorPlacement(mode);
    this.object.position.set(at.x, 0, at.z); // on the ground, whatever the height of the table
    this.object.scale.setScalar(plateWidthM(mode) / IMMERSIVE_PLATE_M);
  }

  update(): void {}

  dispose(): void {
    this.off();
    for (const mesh of this.meshes) mesh.dispose();
    for (const geometry of this.geometries) geometry.dispose();
    this.material.dispose();
  }
}
