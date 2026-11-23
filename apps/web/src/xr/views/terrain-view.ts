/**
 * TerrainSystem view (task 4.1, requirement 4.1, 4.2): dark square plate, glowing cracks that pulse on kicks, and low
 * mountains on the edges. Built once from the template; per frame only the crack intensity changes.
 */
import {
  BoxGeometry,
  BufferGeometry,
  Color,
  ConeGeometry,
  Float32BufferAttribute,
  Group,
  InstancedMesh,
  LineBasicMaterial,
  LineSegments,
  Matrix4,
  Mesh,
  MeshStandardMaterial,
  Quaternion,
  Vector3,
} from 'three';
import { mulberry32, uniform } from '@/engine/prng';
import type { SpawnPlan } from '@/engine/spawn-plan';
import type { WorldState } from '@/engine/world-state';
import {
  CRACK_BASE_INTENSITY,
  CRACK_COUNT,
  CRACK_PULSE_INTENSITY,
  CRACK_SEGMENTS,
  MOUNTAIN_COUNT,
  PLATE_THICKNESS,
} from '../constants';
import type { WorldView } from './world-view';

const CRACK_LIFT = 0.004;
const TERRAIN_SEED_KEY = 0x7e44a1;

/** Random-walk crack polylines on the plate top, as line-segment pairs. Deterministic for a seed. */
export function crackSegments(size: number, seed: number): Float32Array {
  const rng = mulberry32(seed ^ TERRAIN_SEED_KEY);
  const half = size / 2;
  const step = size / 28;
  const out: number[] = [];
  for (let c = 0; c < CRACK_COUNT; c++) {
    let x = uniform(rng, -half, half);
    let z = uniform(rng, -half, half);
    let angle = uniform(rng, 0, Math.PI * 2);
    for (let s = 0; s < CRACK_SEGMENTS; s++) {
      angle += uniform(rng, -0.9, 0.9);
      const nx = Math.min(half, Math.max(-half, x + Math.cos(angle) * step));
      const nz = Math.min(half, Math.max(-half, z + Math.sin(angle) * step));
      out.push(x, CRACK_LIFT, z, nx, CRACK_LIFT, nz);
      x = nx;
      z = nz;
    }
  }
  return new Float32Array(out);
}

export class TerrainView implements WorldView {
  readonly object = new Group();
  private readonly crackMaterial: LineBasicMaterial;
  private readonly crackColor: Color;
  private readonly disposables: Array<{ dispose(): void }> = [];

  constructor(plan: SpawnPlan) {
    const { palette, terrain } = plan.template;
    const size = terrain.size;
    this.object.name = 'terrain';

    const plateGeometry = new BoxGeometry(size, PLATE_THICKNESS, size).translate(0, -PLATE_THICKNESS / 2, 0);
    const plateMaterial = new MeshStandardMaterial({ color: palette.terrain, roughness: 0.95, metalness: 0.05 });
    this.object.add(new Mesh(plateGeometry, plateMaterial));
    this.disposables.push(plateGeometry, plateMaterial);

    this.crackColor = new Color(palette.secondary).lerp(new Color(palette.primary), 0.5);
    this.crackMaterial = new LineBasicMaterial({ color: this.crackColor.clone(), transparent: true, opacity: 0.9 });
    if (terrain.style === 'cracked_plate') {
      const crackGeometry = new BufferGeometry();
      crackGeometry.setAttribute('position', new Float32BufferAttribute(crackSegments(size, plan.seed), 3));
      this.object.add(new LineSegments(crackGeometry, this.crackMaterial));
      this.disposables.push(crackGeometry);
    }
    this.disposables.push(this.crackMaterial);

    if (terrain.mountains === 'edges') this.object.add(this.buildMountains(plan));
  }

  /** Low peaks along the 4 edges in one InstancedMesh. */
  private buildMountains(plan: SpawnPlan): InstancedMesh {
    const size = plan.template.terrain.size;
    const half = size / 2;
    const geometry = new ConeGeometry(1, 1, 6, 1).translate(0, 0.5, 0);
    const material = new MeshStandardMaterial({
      color: new Color(plan.template.palette.terrain).lerp(new Color(plan.template.palette.primary), 0.18),
      roughness: 1,
      flatShading: true,
    });
    const mesh = new InstancedMesh(geometry, material, MOUNTAIN_COUNT);
    const rng = mulberry32(plan.seed ^ (TERRAIN_SEED_KEY << 1));
    const m = new Matrix4();
    const q = new Quaternion();
    for (let i = 0; i < MOUNTAIN_COUNT; i++) {
      const along = uniform(rng, -half * 0.95, half * 0.95);
      const inset = uniform(rng, 0.2, 0.9);
      const edge = i % 4;
      const x = edge === 0 ? -half + inset : edge === 1 ? half - inset : along;
      const z = edge === 2 ? -half + inset : edge === 3 ? half - inset : along;
      const radius = uniform(rng, 0.2, 0.5);
      q.setFromAxisAngle(new Vector3(0, 1, 0), uniform(rng, 0, Math.PI));
      m.compose(new Vector3(x, 0, z), q, new Vector3(radius, uniform(rng, 0.12, 0.45), radius));
      mesh.setMatrixAt(i, m);
    }
    mesh.instanceMatrix.needsUpdate = true;
    this.disposables.push(geometry, material);
    return mesh;
  }

  update(state: WorldState): void {
    const intensity = CRACK_BASE_INTENSITY + CRACK_PULSE_INTENSITY * state.pulses.kick;
    this.crackMaterial.color.copy(this.crackColor).multiplyScalar(intensity);
  }

  /** Current crack glow (for tests and the perf overlay). */
  crackIntensity(): number {
    return this.crackMaterial.color.r / Math.max(1e-9, this.crackColor.r);
  }

  dispose(): void {
    for (const d of this.disposables) d.dispose();
  }
}
