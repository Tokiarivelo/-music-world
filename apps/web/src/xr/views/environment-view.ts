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
  Vector3,
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
  ENV_SKY_RADIUS_M,
  ENV_STAR_DENSITY,
  IMMERSIVE_PLATE_M,
} from '../constants';
import { environmentScale, fogRange, plateWidthM, scaleStore, type ScaleMode } from '../scale';
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

/** Smooth value noise on the plane (seeded lattice, smoothstep blend): seamless around the circle by construction. */
function valueNoise(seed: number): (x: number, y: number) => number {
  const lattice = (ix: number, iy: number): number => {
    const rng = mulberry32(hashSeed(seed, `${ix},${iy}`));
    return rng();
  };
  return (x, y) => {
    const ix = Math.floor(x);
    const iy = Math.floor(y);
    const fx = x - ix;
    const fy = y - iy;
    const u = fx * fx * (3 - 2 * fx);
    const v = fy * fy * (3 - 2 * fy);
    const a = lattice(ix, iy);
    const b = lattice(ix + 1, iy);
    const c = lattice(ix, iy + 1);
    const d = lattice(ix + 1, iy + 1);
    return a + (b - a) * u + (c - a) * v + (a - b - c + d) * u * v;
  };
}

/** Inner and outer radius of the hills (metres before the environment scale) and the grid. */
const HILLS_INNER_M = 56; // beyond the corners of the 170 m plate (anchor 45 m off the origin)
const HILLS_OUTER_M = ENV_GROUND_RADIUS_M - 6;
const HILLS_COLUMNS = 128;
const HILLS_RINGS = 20;
/** Triangles of the hills: part of the environment budget. */
export const HILLS_TRIANGLES = HILLS_COLUMNS * HILLS_RINGS * 2;

/**
 * Rolling hills: a polar height field around the plate, flat where it meets the ground (no wall) and rising to far
 * mountains; layered value noise (low and broad, then ridged detail by `jag`), vertex colors from near to far (hazy and
 * bluer with distance, lighter on the crests) with a baked light from the sun side so the slopes read.
 */
function hillsGeometry(seed: number, near: Color, far: Color, amp = 1, jag = 0.3): BufferGeometry {
  const noise = valueNoise(seed);
  const height = (x: number, z: number, t: number): number => {
    const broad = noise(x / 34, z / 34);
    const mid = noise(x / 15 + 31, z / 15 + 17);
    const fine = noise(x / 6 + 7, z / 6 + 53);
    const ridged = 1 - Math.abs(2 * noise(x / 22 + 101, z / 22 + 5) - 1);
    const shape = 0.55 * broad + 0.3 * mid + 0.15 * fine * (0.5 + jag) + jag * 0.5 * ridged * ridged;
    // Near: gentle rise; far: mountains. `t` runs 0 at the inner edge to 1 at the outer edge.
    return Math.max(0, shape - 0.16) * amp * (3.2 + 22 * t ** 1.8);
  };
  const positions: number[] = [];
  const colors: number[] = [];
  const indices: number[] = [];
  for (let ring = 0; ring <= HILLS_RINGS; ring++) {
    const t = ring / HILLS_RINGS;
    const radius = HILLS_INNER_M + (HILLS_OUTER_M - HILLS_INNER_M) * t;
    for (let i = 0; i < HILLS_COLUMNS; i++) {
      const a = (i / HILLS_COLUMNS) * Math.PI * 2;
      const x = Math.cos(a) * radius;
      const z = Math.sin(a) * radius;
      const edge = Math.min(1, t * 6); // zero height on the first rings: the hills grow out of the ground
      const y = height(x, z, t) * edge;
      positions.push(x, y, z);
    }
  }
  const sun = new Vector3(-0.5, 0.8, -0.35).normalize();
  const normal = new Vector3();
  const tmp = new Color();
  const at = (ring: number, col: number): number => (ring * HILLS_COLUMNS + ((col + HILLS_COLUMNS) % HILLS_COLUMNS)) * 3;
  for (let ring = 0; ring <= HILLS_RINGS; ring++) {
    const t = ring / HILLS_RINGS;
    for (let i = 0; i < HILLS_COLUMNS; i++) {
      const r0 = Math.max(0, ring - 1);
      const r1 = Math.min(HILLS_RINGS, ring + 1);
      const dx = positions[at(ring, i + 1)]! - positions[at(ring, i - 1)]!;
      const dyA = positions[at(ring, i + 1) + 1]! - positions[at(ring, i - 1) + 1]!;
      const dz = positions[at(ring, i + 1) + 2]! - positions[at(ring, i - 1) + 2]!;
      const ex = positions[at(r1, i)]! - positions[at(r0, i)]!;
      const eyA = positions[at(r1, i) + 1]! - positions[at(r0, i) + 1]!;
      const ez = positions[at(r1, i) + 2]! - positions[at(r0, i) + 2]!;
      // normal = (tangent along the circle) x (tangent across rings), flipped to point up
      normal.set(dyA * ez - dz * eyA, dz * ex - dx * ez, dx * eyA - dyA * ex).normalize();
      if (normal.y < 0) normal.negate();
      const light = 0.55 + 0.45 * Math.max(0, normal.dot(sun));
      const y = positions[at(ring, i) + 1]!;
      tmp.copy(near).lerp(far, t ** 0.65).lerp(far, Math.min(0.5, y / 70)); // crests are lighter and bluer
      colors.push(tmp.r * light, tmp.g * light, tmp.b * light);
    }
  }
  for (let ring = 0; ring < HILLS_RINGS; ring++) {
    for (let i = 0; i < HILLS_COLUMNS; i++) {
      const j = (i + 1) % HILLS_COLUMNS;
      const a = ring * HILLS_COLUMNS + i;
      const b = ring * HILLS_COLUMNS + j;
      const c = (ring + 1) * HILLS_COLUMNS + i;
      const d = (ring + 1) * HILLS_COLUMNS + j;
      indices.push(a, c, b, b, c, d);
    }
  }
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
    this.hills = new Mesh(
      hillsGeometry(hashSeed(plan.seed, 'environment-hills'), colors.hillsNear, colors.hillsFar, this.underwater ? 0.12 : 1, this.underwater ? 0.05 : 0.3),
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
    const offBoost = scaleStore.onFogBoost(() => this.applyScale(scaleStore.mode));
    this.unsubscribe = () => {
      offScale();
      offBoost();
    };
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
    const water = (this.underwater ? 0.55 : 1) * scaleStore.fogBoost; // water swallows the distance sooner than air
    // Never past the edge of the ground, so the horizon stays a haze and not a visible disc.
    const edge = ENV_GROUND_RADIUS_M * environmentScale(mode) * 0.85;
    this.fog.near = Math.min(near * water, edge * 0.4);
    this.fog.far = Math.min(far * water, edge);
    this.sky.scale.setScalar(k);
    this.fitGroundTexture(k);
  }

  /** The ground tile keeps its size relative to the plate (grass stays grass-sized on the table-top diorama too). */
  private fitGroundTexture(k: number): void {
    const map = this.ground.material.map;
    const tileM = LANDSCAPES[this.landscape ?? 'template'].tileM;
    if (!map || !tileM) return;
    const plateRatio = plateWidthM(scaleStore.mode) / IMMERSIVE_PLATE_M;
    map.repeat.setScalar((ENV_GROUND_RADIUS_M * 2 * k) / (tileM * plateRatio));
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
      ground.map = texture;
      this.fitGroundTexture(environmentScale(scaleStore.mode));
    } else ground.map = null;
    ground.needsUpdate = true;
    const near = id === 'template' ? this.colors.hillsNear : new Color(l.hillsNear);
    const far = id === 'template' ? this.colors.hillsFar : new Color(l.hillsFar);
    const fresh = hillsGeometry(this.seed, near, far, this.underwater ? 0.12 : l.hillAmp, this.underwater ? 0.05 : l.hillJag);
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
