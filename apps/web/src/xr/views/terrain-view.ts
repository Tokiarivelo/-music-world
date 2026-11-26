/**
 * TerrainSystem view (03-world-engine-core task 4.1; 04-default-template requirement 2): a dark square plate whose top
 * is one height-field grid (open plate in the middle, low rugged mountains on the edges, outside the structure zones),
 * a dried-mud crack network that pulses on kicks, and darker plate sides. Shading is baked into vertex colors of unlit
 * materials, so the look does not depend on the scene lights. Built once per plan; per frame only the crack glow
 * changes.
 */
import {
  BoxGeometry,
  BufferGeometry,
  Color,
  Float32BufferAttribute,
  Group,
  LineBasicMaterial,
  LineSegments,
  Mesh,
  MeshBasicMaterial,
  PlaneGeometry,
  Vector3,
} from 'three';
import type { SpawnPlan } from '@/engine/spawn-plan';
import type { WorldState } from '@/engine/world-state';
import {
  CRACK_BASE_INTENSITY,
  CRACK_PULSE_INTENSITY,
  CRACK_REST_LIGHT,
  CRACK_REST_MIX,
  PLATE_CENTRE_COOL,
  PLATE_CENTRE_LIGHT,
  PLATE_CITY_TINT,
  PLATE_RIM_LIGHT,
  PLATE_SIDE_LIGHT,
  PLATE_THICKNESS,
  TERRAIN_GRID,
  TERRAIN_LIGHT_DIRECTION,
} from '../constants';
import { lightness } from '../palette';
import { worldSize } from '@/engine/city';
import { buildTerrainField, crackNetwork, fieldHeight, type TerrainField } from '../terrain-field';
import { domeStore } from '../dome-store';
import type { WorldView } from './world-view';

const NORMAL_STEP = 0.05;
/** Height (m) over which the plate color blends into the mountain color. */
const MOUNTAIN_BLEND_HEIGHT = 0.06;

/** Centre of the city (buildings and spikes zones) in plate metres, or null without zones. */
function cityCentre(plan: SpawnPlan): { x: number; z: number } | null {
  const half = worldSize(plan.template) / 2;
  const zones = plan.template.zones.filter((z) => z.kind === 'building' || z.kind === 'spike');
  if (zones.length === 0) return null;
  const x = zones.reduce((s, z) => s + (z.xMin + z.xMax) / 2, 0) / zones.length;
  const z = zones.reduce((s, r) => s + (r.zMin + r.zMax) / 2, 0) / zones.length;
  return { x: x * half, z: z * half };
}

/** Plate top: the height field as a grid with baked vertex colors (plate gradient, city tint, mountain shading). */
export function buildPlateTop(plan: SpawnPlan, field: TerrainField): BufferGeometry {
  const { palette } = plan.template;
  const size = worldSize(plan.template);
  const half = size / 2;
  const geometry = new PlaneGeometry(size, size, TERRAIN_GRID, TERRAIN_GRID).rotateX(-Math.PI / 2);
  const position = geometry.getAttribute('position');
  const colors = new Float32Array(position.count * 3);
  const terrain = new Color(palette.terrain);
  const primary = new Color(palette.primary);
  const cool = new Color(palette.secondary);
  const lit = new Color(palette.staff).lerp(new Color(palette.secondary), 0.5);
  const light = new Vector3(
    TERRAIN_LIGHT_DIRECTION.x,
    TERRAIN_LIGHT_DIRECTION.y,
    TERRAIN_LIGHT_DIRECTION.z,
  ).normalize();
  const city = cityCentre(plan);
  const normal = new Vector3();
  const plate = new Color();
  const mountain = new Color();
  for (let i = 0; i < position.count; i++) {
    const x = position.getX(i);
    const z = position.getZ(i);
    const h = fieldHeight(field, x, z);
    position.setY(i, h);

    const r2 = (x * x + z * z) / (half * half * 2);
    plate.copy(terrain).multiplyScalar(lightness(PLATE_RIM_LIGHT + (PLATE_CENTRE_LIGHT - PLATE_RIM_LIGHT) * (1 - r2)));
    plate.lerp(cool, PLATE_CENTRE_COOL * (1 - r2));
    if (city) {
      const d2 = ((x - city.x) ** 2 + (z - city.z) ** 2) / (half * half * 0.5);
      plate.lerp(primary, PLATE_CITY_TINT * Math.exp(-d2));
    }

    let c = plate;
    if (h > 0) {
      const hx = fieldHeight(field, x + NORMAL_STEP, z) - fieldHeight(field, x - NORMAL_STEP, z);
      const hz = fieldHeight(field, x, z + NORMAL_STEP) - fieldHeight(field, x, z - NORMAL_STEP);
      normal.set(-hx, 2 * NORMAL_STEP, -hz).normalize();
      const ndl = Math.max(0, normal.dot(light));
      mountain
        .copy(terrain)
        .multiplyScalar(lightness(0.5 + 0.8 * ndl))
        .lerp(lit, 0.03 * ndl * ndl);
      c = mountain.lerp(plate, 1 - Math.min(1, h / MOUNTAIN_BLEND_HEIGHT)).clone();
    }
    colors[i * 3] = c.r;
    colors[i * 3 + 1] = c.g;
    colors[i * 3 + 2] = c.b;
  }
  geometry.setAttribute('color', new Float32BufferAttribute(colors, 3));
  position.needsUpdate = true;
  return geometry;
}

export class TerrainView implements WorldView {
  readonly object = new Group();
  private readonly crackMaterial: LineBasicMaterial;
  private readonly crackRest: Color;
  private readonly crackPulse: Color;
  private readonly pulse = new Color();
  private intensity = CRACK_BASE_INTENSITY;
  private readonly disposables: Array<{ dispose(): void }> = [];
  readonly field: TerrainField;

  constructor(plan: SpawnPlan) {
    const { palette, terrain } = plan.template;
    const size = worldSize(plan.template);
    this.object.name = 'terrain';
    this.field = buildTerrainField(plan.template, plan.seed);

    const top = buildPlateTop(plan, this.field);
    const topMaterial = new MeshBasicMaterial({ vertexColors: true });
    this.object.add(new Mesh(top, topMaterial));
    // Sides: the top of the box stays just below the height field to avoid z-fighting.
    const sides = new BoxGeometry(size, PLATE_THICKNESS, size).translate(0, -PLATE_THICKNESS / 2 - 0.002, 0);
    const sideMaterial = new MeshBasicMaterial({
      color: new Color(palette.terrain).multiplyScalar(lightness(PLATE_SIDE_LIGHT)),
    });
    this.object.add(new Mesh(sides, sideMaterial));
    this.disposables.push(top, topMaterial, sides, sideMaterial);

    // At rest the cracks are a shade darker than the plate (dried mud), with a faint cool rim of light.
    this.crackRest = new Color(palette.terrain)
      .multiplyScalar(lightness(CRACK_REST_LIGHT))
      .lerp(new Color(palette.staff), CRACK_REST_MIX);
    this.crackPulse = new Color(palette.secondary).lerp(new Color(palette.primary), 0.5);
    this.crackMaterial = new LineBasicMaterial({ color: this.crackRest.clone(), transparent: true, opacity: 0.85 });
    if (terrain.style === 'cracked_plate') {
      const crackGeometry = new BufferGeometry();
      crackGeometry.setAttribute('position', new Float32BufferAttribute(crackNetwork(this.field, plan.seed), 3));
      this.object.add(new LineSegments(crackGeometry, this.crackMaterial));
      this.disposables.push(crackGeometry);
    }
    this.disposables.push(this.crackMaterial);
  }

  update(state: WorldState): void {
    this.object.visible = !domeStore.enabled; // the dome world has no plate: the landscape ground carries everything
    const kick = state.pulses.kick;
    this.intensity = CRACK_BASE_INTENSITY + CRACK_PULSE_INTENSITY * kick;
    this.pulse.copy(this.crackPulse).multiplyScalar(CRACK_PULSE_INTENSITY * kick);
    this.crackMaterial.color.copy(this.crackRest).add(this.pulse);
  }

  /** Current crack glow (rest intensity + kick pulse), for tests and the perf overlay. */
  crackIntensity(): number {
    return this.intensity;
  }

  dispose(): void {
    for (const d of this.disposables) d.dispose();
  }
}
