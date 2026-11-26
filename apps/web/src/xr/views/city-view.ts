/**
 * City ground view (I39): blocks, streets, crossings, bridges, lake water and traffic lights of `engine/city.ts`. All of
 * it appears inside the radius the music has reached (`cityFront`), with a bright rim on the front line. Traffic lights
 * change with the beat: the two streets of a crossing alternate green, yellow, red.
 */
import {
  BoxGeometry,
  Color,
  Group,
  InstancedMesh,
  Matrix4,
  Mesh,
  MeshBasicMaterial,
  Quaternion,
  Vector3,
  type BufferGeometry,
} from 'three';
import { mergeGeometries } from 'three/examples/jsm/utils/BufferGeometryUtils.js';
import { cityFront, cityOf, signalColor, type City } from '@/engine/city';
import type { SpawnPlan } from '@/engine/spawn-plan';
import type { WorldState } from '@/engine/world-state';
import { buildCityGeometry, buildWaterGeometry, type CityTone } from '../shapes/city-geometry';
import { waterMaterial, syncWater } from '../shapes/water-material';
import { revealMaterial, setReveal } from '../shapes/reveal-material';
import type { WorldView } from './world-view';

const POLE_HEIGHT = 0.34;
const COLORS = [new Color('#ff3b30'), new Color('#ffc233'), new Color('#35e06b')] as const;
const Y_AXIS = new Vector3(0, 1, 0);

function poleGeometry(): BufferGeometry {
  const pole = new BoxGeometry(0.018, POLE_HEIGHT, 0.018).translate(0, POLE_HEIGHT / 2, 0);
  const head = new BoxGeometry(0.055, 0.13, 0.04).translate(0, POLE_HEIGHT - 0.04, 0.012);
  return mergeGeometries([pole.toNonIndexed(), head.toNonIndexed()]) ?? pole;
}

/** Night palettes get a darker ground that leans toward the template's terrain color. */
function toneOf(plan: SpawnPlan): CityTone {
  const { background, terrain } = plan.template.palette;
  const bg = new Color(background);
  const luminance = 0.2126 * bg.r + 0.7152 * bg.g + 0.0722 * bg.b;
  return { gain: luminance < 0.08 ? 0.62 : 1, tint: new Color(terrain), tintAmount: luminance < 0.08 ? 0.22 : 0.08 };
}

export class CityView implements WorldView {
  readonly object = new Group();
  readonly city: City;
  private readonly ground: Mesh;
  private readonly water: Mesh;
  private readonly poles: InstancedMesh;
  private readonly lamps: InstancedMesh;
  private readonly materials: MeshBasicMaterial[];
  private readonly tint = new Color();
  private lastT = Number.NaN;

  constructor(private readonly plan: SpawnPlan) {
    this.city = cityOf(plan.template, plan.seed);
    this.object.name = 'city';
    const groundMaterial = revealMaterial({ vertexColors: true });
    const waterMat = waterMaterial({ vertexColors: true });
    const poleMaterial = revealMaterial({ color: 0x3a3d45 });
    const lampMaterial = revealMaterial({ color: 0xffffff });
    this.materials = [groundMaterial, waterMat, poleMaterial, lampMaterial];
    this.ground = new Mesh(buildCityGeometry(this.city, toneOf(plan)), groundMaterial);
    this.ground.name = 'city:ground';
    this.water = new Mesh(buildWaterGeometry(this.city, toneOf(plan)), waterMat);
    this.water.name = 'city:water';
    this.water.onBeforeRender = () => syncWater(waterMat);
    const n = this.city.lights.length;
    this.poles = new InstancedMesh(poleGeometry(), poleMaterial, n);
    this.lamps = new InstancedMesh(new BoxGeometry(0.03, 0.03, 0.02).translate(0, POLE_HEIGHT - 0.04, 0.04), lampMaterial, n);
    const m = new Matrix4();
    const q = new Quaternion();
    this.city.lights.forEach((light, i) => {
      q.setFromAxisAngle(Y_AXIS, light.facing);
      m.compose(new Vector3(light.x, 0.01, light.z), q, new Vector3(1, 1, 1));
      this.poles.setMatrixAt(i, m);
      this.lamps.setMatrixAt(i, m);
      this.lamps.setColorAt(i, COLORS[0]);
    });
    for (const mesh of [this.ground, this.water, this.poles, this.lamps]) {
      mesh.frustumCulled = false;
      this.object.add(mesh);
    }
  }

  drawCalls(): number {
    return 4;
  }

  update(state: WorldState): void {
    if (state.t === this.lastT) return;
    this.lastT = state.t;
    const front = cityFront(this.city, state.t, this.plan.durationSec);
    for (const material of this.materials) setReveal(material, front);
    this.city.lights.forEach((light, i) => {
      this.lamps.setColorAt(i, this.tint.copy(COLORS[signalColor(light.axis, state.t, light.phase)]!).multiplyScalar(light.key < front ? 1.6 : 0));
    });
    if (this.lamps.instanceColor) this.lamps.instanceColor.needsUpdate = true;
  }

  dispose(): void {
    for (const mesh of [this.ground, this.water, this.poles, this.lamps]) mesh.geometry.dispose();
    for (const material of this.materials) material.dispose();
  }
}
