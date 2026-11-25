/**
 * Environment around the plate (I2): a sky dome (palette gradient, horizon glow, still stars), a ground disc that fades
 * into the fog, and two rings of low hills. View only: it never reads the world state, so `worldStateAt` is untouched.
 * Fixed in the world (not on the scaled diorama), so in VR it surrounds the user. Three draw calls, about 2 k triangles,
 * no texture (gradients and stars are computed in the sky shader), nothing animated, so `prefers-reduced-motion` holds.
 */
import {
  BackSide,
  BufferGeometry,
  RepeatWrapping,
  SRGBColorSpace,
  TextureLoader,
  Texture,
  CircleGeometry,
  Color,
  DoubleSide,
  Float32BufferAttribute,
  Fog,
  Points,
  Group,
  Mesh,
  MeshBasicMaterial,
  ShaderMaterial,
  SphereGeometry,
  AdditiveBlending,
} from 'three';
import { hashSeed, mulberry32 } from '@/engine/prng';
import type { SpawnPlan } from '@/engine/spawn-plan';
import {
  ENV_FOG_FAR_M,
  ENV_FOG_NEAR_M,
  ENV_GROUND_RADIUS_M,
  ENV_HILL_COLUMNS,
  ENV_HILL_RINGS,
  ENV_SKY_RADIUS_M,
  ENV_STAR_DENSITY,
} from '../constants';
import { environmentScale, fogRange, scaleStore, type ScaleMode } from '../scale';
import { environmentColors, underwaterColors, type EnvironmentColors } from '../palette';
import type { WorldState } from '@/engine/world-state';
import { LANDSCAPES, type LandscapeId } from '@/engine/landscapes';
import { domeStore } from '../dome-store';
import type { WorldView } from './world-view';

const SKY_VERTEX = /* glsl */ `
varying vec3 vDir;
void main() {
  vDir = normalize(position);
  gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
}`;

const SKY_FRAGMENT = /* glsl */ `
uniform vec3 uZenith;
uniform vec3 uMid;
uniform vec3 uHorizon;
uniform vec3 uStar;
uniform float uStarDensity;
uniform float uUnder;
uniform vec3 uRay;
uniform float uTime;
varying vec3 vDir;

float hash(vec3 p) {
  p = fract(p * 0.3183099 + vec3(0.1, 0.2, 0.3));
  p *= 17.0;
  return fract(p.x * p.y * p.z * (p.x + p.y + p.z));
}

void main() {
  float h = clamp(vDir.y, 0.0, 1.0);
  vec3 col = mix(uHorizon, uMid, smoothstep(0.0, 0.35, h));
  col = mix(col, uZenith, smoothstep(0.3, 1.0, h));
  col += uHorizon * pow(1.0 - h, 6.0) * 0.55; // horizon glow
  // Still stars: one hashed cell grid over the sphere, only in the upper sky.
  vec3 cell = floor(vDir * 90.0);
  float r = hash(cell);
  float star = step(1.0 - uStarDensity, r) * smoothstep(0.12, 0.4, h);
  vec2 f = fract(vDir.xz * 90.0) - 0.5;
  star *= smoothstep(0.35, 0.0, length(f));
  col += uStar * star * (0.35 + 0.65 * hash(cell + 7.0));
  if (uUnder > 0.5) {
    // Water column: surface light above fading to deep blue, slanted light shafts that sway slowly.
    float up = clamp(vDir.y * 0.5 + 0.5, 0.0, 1.0);
    col = mix(uHorizon, uMid, smoothstep(0.35, 0.62, up));
    col = mix(col, uZenith, smoothstep(0.6, 1.0, up));
    float az = atan(vDir.z, vDir.x);
    float shafts = sin(az * 9.0 + vDir.y * 5.0 + uTime * 0.15) * sin(az * 23.0 - vDir.y * 3.0 - uTime * 0.1);
    col += uRay * smoothstep(0.25, 0.9, shafts) * smoothstep(0.4, 0.95, up) * 0.22;
  }
  gl_FragColor = vec4(col, 1.0);
  #include <colorspace_fragment>
}`;

const BUBBLE_VERTEX = /* glsl */ `
uniform float uTime;
uniform float uSize;
attribute vec4 aSeed;
void main() {
  float rise = fract(aSeed.w + uTime * (0.03 + 0.04 * aSeed.z));
  vec3 p = vec3(aSeed.x * 22.0, rise * 16.0, aSeed.y * 22.0);
  p.x += sin(uTime * 0.6 + aSeed.z * 20.0) * 0.25;
  vec4 mv = modelViewMatrix * vec4(p, 1.0);
  gl_Position = projectionMatrix * mv;
  gl_PointSize = uSize * (0.5 + aSeed.z) / max(0.5, -mv.z);
}`;

const BUBBLE_FRAGMENT = /* glsl */ `
uniform vec3 uColor;
void main() {
  float d = length(gl_PointCoord - 0.5);
  float ring = smoothstep(0.5, 0.42, d) * (0.35 + 0.65 * smoothstep(0.25, 0.45, d));
  if (ring < 0.02) discard;
  gl_FragColor = vec4(uColor, ring * 0.7);
}`;

const groundTextures = new Map<string, Texture>();
/** Ground tiles are shared by every environment of the page and repeat over the ground disc. */
function groundTexture(name: string, base = '/ground'): Texture {
  let texture = groundTextures.get(name);
  if (!texture) {
    texture = new TextureLoader().load(`${base}/${name}.jpg`);
    texture.wrapS = RepeatWrapping;
    texture.wrapT = RepeatWrapping;
    texture.colorSpace = SRGBColorSpace;
    texture.anisotropy = 8;
    groundTextures.set(name, texture);
  }
  return texture;
}

/** Number of draw calls of the environment (requirement 5: ≤ 6). */
export const ENVIRONMENT_DRAW_CALLS = 4; // underwater templates add one more (the bubbles)

/** One ring of hills: a closed strip, base at y = 0, crest height from seeded harmonics. */
function hillsGeometry(radii: readonly number[], columns: number, seed: number, near: Color, far: Color, amp = 1, jag = 0.3): BufferGeometry {
  const positions: number[] = [];
  const colors: number[] = [];
  const indices: number[] = [];
  const rng = mulberry32(seed);
  const tmp = new Color();
  radii.forEach((radius, ring) => {
    const base = positions.length / 3;
    const t = radii.length > 1 ? ring / (radii.length - 1) : 0;
    const phases = [rng() * Math.PI * 2, rng() * Math.PI * 2, rng() * Math.PI * 2];
    const heightScale = 3 + 5 * t; // farther rings are taller (they read as mountains)
    for (let i = 0; i < columns; i++) {
      const a = (i / columns) * Math.PI * 2;
      const crest =
        heightScale *
        amp *
        (0.45 +
          0.3 * Math.sin(a * 3 + phases[0]!) +
          0.2 * Math.sin(a * 7 + phases[1]!) +
          0.4 * jag * Math.sin(a * 17 + phases[2]!) +
          0.25 * jag * Math.sin(a * 41 + phases[0]! * 2));
      const x = Math.cos(a) * radius;
      const z = Math.sin(a) * radius;
      positions.push(x, -0.5, z, x, Math.max(0.4, crest), z);
      tmp.copy(near).lerp(far, t ** 0.65); // far ridges are lighter and bluer: atmospheric perspective
      colors.push(tmp.r * 0.6, tmp.g * 0.6, tmp.b * 0.6, tmp.r, tmp.g, tmp.b);
    }
    for (let i = 0; i < columns; i++) {
      const j = (i + 1) % columns;
      const a0 = base + i * 2;
      const b0 = base + j * 2;
      indices.push(a0, b0, a0 + 1, b0, b0 + 1, a0 + 1);
    }
  });
  const geometry = new BufferGeometry();
  geometry.setAttribute('position', new Float32BufferAttribute(positions, 3));
  geometry.setAttribute('color', new Float32BufferAttribute(colors, 3));
  geometry.setIndex(indices);
  return geometry;
}

export class EnvironmentView implements WorldView {
  readonly object = new Group();
  /** Fog matching the horizon color: the ground and the hills melt into the sky. */
  readonly fog: Fog;
  readonly colors: EnvironmentColors;
  private readonly sky: Mesh<SphereGeometry, ShaderMaterial>;
  private readonly ground: Mesh<CircleGeometry, MeshBasicMaterial>;
  private hills: Mesh<BufferGeometry, MeshBasicMaterial>;
  private readonly mist: Mesh<BufferGeometry, MeshBasicMaterial>;
  private landscape: LandscapeId | null = null;
  private readonly seed: number;
  private readonly radii: number[];
  private readonly offLandscape: () => void;
  private readonly underwater: boolean;
  private readonly bubbles: Points<BufferGeometry, ShaderMaterial> | null = null;
  private readonly reduced: boolean;

  constructor(plan: SpawnPlan) {
    this.underwater = plan.template.fx.environment === 'underwater';
    this.reduced = typeof matchMedia === 'function' && matchMedia('(prefers-reduced-motion: reduce)').matches;
    const water = underwaterColors(plan.template.palette);
    const base = environmentColors(plan.template.palette);
    const colors: EnvironmentColors = this.underwater
      ? { zenith: water.surface, mid: water.mid, horizon: water.deep, ground: water.seabed, hillsNear: water.duneNear, hillsFar: water.duneFar, star: water.ray }
      : base;
    this.colors = colors;
    this.object.name = 'environment';
    this.fog = new Fog(colors.horizon, ENV_FOG_NEAR_M, ENV_FOG_FAR_M);

    this.sky = new Mesh(
      new SphereGeometry(ENV_SKY_RADIUS_M, 32, 16),
      new ShaderMaterial({
        vertexShader: SKY_VERTEX,
        fragmentShader: SKY_FRAGMENT,
        uniforms: {
          uZenith: { value: colors.zenith },
          uMid: { value: colors.mid },
          uHorizon: { value: colors.horizon },
          uStar: { value: colors.star },
          uStarDensity: { value: this.underwater ? 0 : ENV_STAR_DENSITY },
          uUnder: { value: this.underwater ? 1 : 0 },
          uRay: { value: water.ray },
          uTime: { value: 0 },
        },
        side: BackSide,
        depthWrite: false,
        fog: false,
      }),
    );
    this.sky.renderOrder = -10;
    this.sky.frustumCulled = false;

    const groundGeometry = new CircleGeometry(ENV_GROUND_RADIUS_M, 48);
    groundGeometry.rotateX(-Math.PI / 2);
    const count = groundGeometry.getAttribute('position').count;
    const groundColors: number[] = [];
    for (let i = 0; i < count; i++) {
      const edge = i === 0 ? 0 : 1; // CircleGeometry: vertex 0 is the centre
      const c = colors.ground.clone().lerp(colors.horizon, edge);
      groundColors.push(c.r, c.g, c.b);
    }
    groundGeometry.setAttribute('color', new Float32BufferAttribute(groundColors, 3));
    this.ground = new Mesh(groundGeometry, new MeshBasicMaterial({ vertexColors: true, side: DoubleSide }));
    this.ground.position.y = -0.02; // below the VR floor plane: no z-fight with a floor-level surface

    this.seed = hashSeed(plan.seed, 'environment-hills');
    const radii = Array.from({ length: ENV_HILL_RINGS }, (_, i) => 24 + (i * (ENV_GROUND_RADIUS_M - 12 - 24)) / Math.max(1, ENV_HILL_RINGS - 1));
    this.radii = radii;
    this.hills = new Mesh(
      hillsGeometry(radii, ENV_HILL_COLUMNS, hashSeed(plan.seed, 'environment-hills'), colors.hillsNear, colors.hillsFar),
      new MeshBasicMaterial({ vertexColors: true, side: DoubleSide }),
    );

    // A low band of mist between the hills and the viewer: opaque at the ground, fading out above (like the reference photos).
    const mistGeometry = new BufferGeometry();
    const mistPositions: number[] = [];
    const mistColors: number[] = [];
    const mistIndices: number[] = [];
    const MIST_COLUMNS = 64;
    for (let i = 0; i < MIST_COLUMNS; i++) {
      const a = (i / MIST_COLUMNS) * Math.PI * 2;
      const x = Math.cos(a) * (ENV_GROUND_RADIUS_M - 14);
      const z = Math.sin(a) * (ENV_GROUND_RADIUS_M - 14);
      mistPositions.push(x, 0, z, x, 7, z);
      mistColors.push(1, 1, 1, 0.5, 1, 1, 1, 0);
      const j = (i + 1) % MIST_COLUMNS;
      mistIndices.push(i * 2, j * 2, i * 2 + 1, j * 2, j * 2 + 1, i * 2 + 1);
    }
    mistGeometry.setAttribute('position', new Float32BufferAttribute(mistPositions, 3));
    mistGeometry.setAttribute('color', new Float32BufferAttribute(mistColors, 4));
    mistGeometry.setIndex(mistIndices);
    this.mist = new Mesh(mistGeometry, new MeshBasicMaterial({ vertexColors: true, transparent: true, depthWrite: false, side: DoubleSide, fog: false }));
    this.mist.material.color.copy(colors.horizon);
    this.mist.renderOrder = 1;
    this.mist.frustumCulled = false;

    if (this.underwater) {
      this.mist.visible = false;
      const count = 260;
      const rng = mulberry32(hashSeed(plan.seed, 'bubbles'));
      const seeds: number[] = [];
      const origin: number[] = [];
      for (let i = 0; i < count; i++) {
        seeds.push(rng() * 2 - 1, rng() * 2 - 1, rng(), rng());
        origin.push(0, 0, 0);
      }
      const geometry = new BufferGeometry();
      geometry.setAttribute('position', new Float32BufferAttribute(origin, 3));
      geometry.setAttribute('aSeed', new Float32BufferAttribute(seeds, 4));
      this.bubbles = new Points(
        geometry,
        new ShaderMaterial({
          vertexShader: BUBBLE_VERTEX,
          fragmentShader: BUBBLE_FRAGMENT,
          uniforms: { uTime: { value: 0 }, uSize: { value: 90 }, uColor: { value: water.ray.clone().lerp(new Color('#ffffff'), 0.5) } },
          transparent: true,
          depthWrite: false,
          blending: AdditiveBlending,
          fog: false,
        }),
      );
      this.bubbles.frustumCulled = false;
      this.bubbles.renderOrder = 2;
      this.object.add(this.bubbles);
    }
    this.object.add(this.sky, this.ground, this.hills, this.mist);
    this.applyScale(scaleStore.mode);
    const offScale = scaleStore.subscribe((mode) => this.applyScale(mode));
    this.unsubscribe = offScale;
    this.offLandscape = domeStore.subscribe(() => this.applyLandscape());
    this.applyLandscape();
  }

  private readonly unsubscribe: () => void;

  /** The horizon moves out with the plate (I7): ground, hills and fog scale, the sky stays around the viewer. */
  private applyScale(mode: ScaleMode): void {
    const k = environmentScale(mode);
    this.ground.scale.setScalar(k);
    this.hills.scale.setScalar(k);
    this.mist.scale.setScalar(k);
    this.bubbles?.scale.setScalar(k);
    const { near, far } = fogRange(mode);
    const water = this.underwater ? 0.55 : 1; // water swallows the distance sooner than air
    this.fog.near = near * water;
    this.fog.far = far * water;
    this.sky.scale.setScalar(k);
  }

  /**
   * Dome world: the viewer's landscape recolors the ground (a photographic tile fading into the haze) and rebuilds the
   * hills; the plate world and the `template` landscape keep the palette look. Cheap: about 2 k triangles.
   */
  private applyLandscape(): void {
    const { enabled, landscape } = domeStore.settings;
    const id: LandscapeId = enabled && !this.underwater ? landscape : 'template';
    if (id === this.landscape) return;
    this.landscape = id;
    const l = LANDSCAPES[id];
    const ground = this.ground.material;
    const geometry = this.ground.geometry;
    const count = geometry.getAttribute('position').count;
    const colors: number[] = [];
    const haze = id === 'template' ? this.colors.horizon : new Color(l.haze);
    const centre = id === 'template' ? this.colors.ground : new Color(l.gain, l.gain, l.gain);
    for (let i = 0; i < count; i++) {
      const c = centre.clone().lerp(haze, i === 0 ? 0 : 1);
      colors.push(c.r, c.g, c.b);
    }
    geometry.setAttribute('color', new Float32BufferAttribute(colors, 3));
    if (l.texture) {
      const texture = groundTexture(l.texture);
      texture.repeat.setScalar((ENV_GROUND_RADIUS_M * 2 * environmentScale('immersive')) / l.tileM);
      ground.map = texture;
    } else ground.map = null;
    ground.needsUpdate = true;
    const near = id === 'template' ? this.colors.hillsNear : new Color(l.hillsNear);
    const far = id === 'template' ? this.colors.hillsFar : new Color(l.hillsFar);
    const fresh = hillsGeometry(this.radii, ENV_HILL_COLUMNS, this.seed, near, far, this.underwater ? 0.35 : l.hillAmp, this.underwater ? 0.05 : l.hillJag);
    this.hills.geometry.dispose();
    this.hills.geometry = fresh;
    this.mist.material.color.copy(haze);
    this.fog.color.copy(haze); // the ground and the hills melt into the haze of the landscape
  }

  /** Static except the bubbles and the light shafts, which follow the audio clock (view only, frozen when motion is reduced). */
  update(state?: WorldState): void {
    if (!this.underwater || this.reduced) return;
    const t = state?.t ?? 0;
    this.sky.material.uniforms.uTime!.value = t;
    if (this.bubbles) this.bubbles.material.uniforms.uTime!.value = t;
  }

  dispose(): void {
    this.unsubscribe();
    this.offLandscape();
    for (const mesh of [this.sky, this.ground, this.hills, this.mist, ...(this.bubbles ? [this.bubbles] : [])]) {
      mesh.geometry.dispose();
      mesh.material.dispose();
    }
  }
}
