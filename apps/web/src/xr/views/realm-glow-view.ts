/**
 * Enchanted atmosphere (I41): drifting fairy lights and low mist over a realm (a land world whose objects grow in
 * patches, `worldPlanKind` = realm). Two draw calls. Every position is a pure function of the song time, so a seek
 * lands where playing would have been; other worlds get an empty group.
 */
import {
  AdditiveBlending,
  BufferAttribute,
  BufferGeometry,
  Color,
  DoubleSide,
  Group,
  InstancedMesh,
  Matrix4,
  Mesh,
  Object3D,
  PlaneGeometry,
  Points,
  Quaternion,
  ShaderMaterial,
  Vector3,
} from 'three';
import { worldSize } from '@/engine/city';
import { hashSeed, mulberry32 } from '@/engine/prng';
import type { SpawnPlan } from '@/engine/spawn-plan';
import type { WorldState } from '@/engine/world-state';
import { worldPlanKind } from '@/engine/world-plan';
import type { WorldView } from './world-view';

const LIGHT_COUNT = 140;
const MIST_COUNT = 18;

const LIGHT_VERTEX = /* glsl */ `
attribute vec3 color;
attribute float flicker;
uniform float uTime;
uniform float uPixel;
varying vec3 vColor;
varying float vGlow;
void main() {
  vColor = color;
  vGlow = 0.55 + 0.45 * sin(uTime * (1.2 + flicker) + flicker * 40.0);
  vec4 mv = modelViewMatrix * vec4(position, 1.0);
  gl_PointSize = uPixel * (0.6 + vGlow * 0.6) / max(0.2, -mv.z);
  gl_Position = projectionMatrix * mv;
}
`;
const LIGHT_FRAGMENT = /* glsl */ `
varying vec3 vColor;
varying float vGlow;
void main() {
  float d = length(gl_PointCoord - 0.5) * 2.0;
  float a = smoothstep(1.0, 0.0, d);
  gl_FragColor = vec4(vColor * (0.6 + vGlow), a * a);
}
`;
const MIST_VERTEX = /* glsl */ `
varying vec2 vUv;
void main() {
  vUv = uv;
  gl_Position = projectionMatrix * modelViewMatrix * instanceMatrix * vec4(position, 1.0);
}
`;
const MIST_FRAGMENT = /* glsl */ `
uniform vec3 uColor;
varying vec2 vUv;
void main() {
  float d = length(vUv - 0.5) * 2.0;
  float a = smoothstep(1.0, 0.1, d);
  gl_FragColor = vec4(uColor, a * a * 0.22);
}
`;

export class RealmGlowView implements WorldView {
  readonly object = new Group();
  private readonly home: Float32Array;
  private readonly lights?: Points<BufferGeometry, ShaderMaterial>;
  private readonly mist?: InstancedMesh<PlaneGeometry, ShaderMaterial>;
  private readonly mistBase: Array<{ x: number; z: number; r: number; speed: number; phase: number }> = [];
  private readonly size: number;
  private readonly m = new Matrix4();
  private readonly q = new Quaternion().setFromAxisAngle(new Vector3(1, 0, 0), -Math.PI / 2);
  private readonly pos = new Vector3();
  private readonly sc = new Vector3();

  constructor(plan: SpawnPlan) {
    this.object.name = 'realm-glow';
    this.size = worldSize(plan.template);
    this.home = new Float32Array(LIGHT_COUNT * 3);
    if (worldPlanKind(plan.template) !== 'realm') return;
    const rng = mulberry32(hashSeed(plan.seed, 'realm-glow'));
    const half = this.size / 2;
    const palette = plan.template.palette;
    const tints = [palette.accent, palette.secondary, palette.primary, '#fff2c8'].map((c) => new Color(c));

    const positions = new Float32Array(LIGHT_COUNT * 3);
    const colors = new Float32Array(LIGHT_COUNT * 3);
    const flicker = new Float32Array(LIGHT_COUNT);
    for (let i = 0; i < LIGHT_COUNT; i += 1) {
      this.home[i * 3] = (rng() * 2 - 1) * half * 0.95;
      this.home[i * 3 + 1] = 0.2 + rng() * this.size * 0.22;
      this.home[i * 3 + 2] = (rng() * 2 - 1) * half * 0.95;
      const tint = tints[Math.floor(rng() * tints.length)]!;
      colors.set([tint.r, tint.g, tint.b], i * 3);
      flicker[i] = rng();
    }
    const geometry = new BufferGeometry();
    geometry.setAttribute('position', new BufferAttribute(positions, 3));
    geometry.setAttribute('color', new BufferAttribute(colors, 3));
    geometry.setAttribute('flicker', new BufferAttribute(flicker, 1));
    const material = new ShaderMaterial({
      vertexShader: LIGHT_VERTEX,
      fragmentShader: LIGHT_FRAGMENT,
      uniforms: { uTime: { value: 0 }, uPixel: { value: 90 * Math.max(1, this.size / 12) } },
      transparent: true,
      depthWrite: false,
      blending: AdditiveBlending,
    });
    this.lights = new Points(geometry, material);
    this.lights.frustumCulled = false;
    this.lights.renderOrder = 4;
    this.object.add(this.lights);

    const mist = new Color(palette.primary).lerp(new Color('#ffffff'), 0.55);
    this.mist = new InstancedMesh(
      new PlaneGeometry(1, 1),
      new ShaderMaterial({
        vertexShader: MIST_VERTEX,
        fragmentShader: MIST_FRAGMENT,
        uniforms: { uColor: { value: mist } },
        transparent: true,
        depthWrite: false,
        side: DoubleSide,
      }),
      MIST_COUNT,
    );
    this.mist.frustumCulled = false;
    this.mist.renderOrder = 3;
    for (let i = 0; i < MIST_COUNT; i += 1) {
      this.mistBase.push({ x: (rng() * 2 - 1) * half, z: (rng() * 2 - 1) * half, r: half * (0.25 + rng() * 0.3), speed: 0.03 + rng() * 0.05, phase: rng() * 6.28 });
    }
    this.object.add(this.mist);
    this.update({ t: 0 } as WorldState);
  }

  update(state: WorldState): void {
    const t = state.t;
    if (this.lights) {
      const attr = this.lights.geometry.getAttribute('position') as BufferAttribute;
      const a = attr.array as Float32Array;
      for (let i = 0; i < LIGHT_COUNT; i += 1) {
        const k = i * 3;
        const ph = i * 1.618;
        a[k] = this.home[k]! + Math.sin(t * 0.21 + ph) * 0.9;
        a[k + 1] = this.home[k + 1]! + Math.sin(t * 0.33 + ph * 2) * 0.35;
        a[k + 2] = this.home[k + 2]! + Math.cos(t * 0.17 + ph) * 0.9;
      }
      attr.needsUpdate = true;
      this.lights.material.uniforms.uTime!.value = t;
    }
    if (this.mist) {
      for (let i = 0; i < MIST_COUNT; i += 1) {
        const b = this.mistBase[i]!;
        this.pos.set(b.x + Math.sin(t * b.speed + b.phase) * b.r * 0.6, 0.35 + 0.15 * Math.sin(t * 0.1 + b.phase), b.z + Math.cos(t * b.speed * 0.8 + b.phase) * b.r * 0.6);
        this.sc.set(b.r * 2.4, b.r * 2.4, 1);
        this.m.compose(this.pos, this.q, this.sc);
        this.mist.setMatrixAt(i, this.m);
      }
      this.mist.instanceMatrix.needsUpdate = true;
    }
  }

  dispose(): void {
    this.object.traverse((o: Object3D) => {
      const mesh = o as Mesh;
      mesh.geometry?.dispose();
      (mesh.material as ShaderMaterial | undefined)?.dispose();
    });
  }
}
