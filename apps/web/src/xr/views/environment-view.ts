/**
 * Environment around the plate (I2): a sky dome (palette gradient, horizon glow, still stars), a ground disc that fades
 * into the fog, and two rings of low hills. View only: it never reads the world state, so `worldStateAt` is untouched.
 * Fixed in the world (not on the scaled diorama), so in VR it surrounds the user. Three draw calls, about 2 k triangles,
 * no texture (gradients and stars are computed in the sky shader), nothing animated, so `prefers-reduced-motion` holds.
 */
import {
  BackSide,
  BufferGeometry,
  CircleGeometry,
  Color,
  DoubleSide,
  Float32BufferAttribute,
  Fog,
  Group,
  Mesh,
  MeshBasicMaterial,
  ShaderMaterial,
  SphereGeometry,
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
import { environmentColors, type EnvironmentColors } from '../palette';
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
  gl_FragColor = vec4(col, 1.0);
  #include <colorspace_fragment>
}`;

/** Number of draw calls of the environment (requirement 5: ≤ 6). */
export const ENVIRONMENT_DRAW_CALLS = 3;

/** One ring of hills: a closed strip, base at y = 0, crest height from seeded harmonics. */
function hillsGeometry(radii: readonly number[], columns: number, seed: number, near: Color, far: Color): BufferGeometry {
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
        (0.45 + 0.3 * Math.sin(a * 3 + phases[0]!) + 0.2 * Math.sin(a * 7 + phases[1]!) + 0.12 * Math.sin(a * 17 + phases[2]!));
      const x = Math.cos(a) * radius;
      const z = Math.sin(a) * radius;
      positions.push(x, -0.5, z, x, Math.max(0.4, crest), z);
      tmp.copy(near).lerp(far, t);
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
  private readonly hills: Mesh<BufferGeometry, MeshBasicMaterial>;

  constructor(plan: SpawnPlan) {
    const colors = environmentColors(plan.template.palette);
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
          uStarDensity: { value: ENV_STAR_DENSITY },
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

    const radii = Array.from({ length: ENV_HILL_RINGS }, (_, i) => 24 + (i * (ENV_GROUND_RADIUS_M - 12 - 24)) / Math.max(1, ENV_HILL_RINGS - 1));
    this.hills = new Mesh(
      hillsGeometry(radii, ENV_HILL_COLUMNS, hashSeed(plan.seed, 'environment-hills'), colors.hillsNear, colors.hillsFar),
      new MeshBasicMaterial({ vertexColors: true, side: DoubleSide }),
    );

    this.object.add(this.sky, this.ground, this.hills);
    this.applyScale(scaleStore.mode);
    this.unsubscribe = scaleStore.subscribe((mode) => this.applyScale(mode));
  }

  private readonly unsubscribe: () => void;

  /** The horizon moves out with the plate (I7): ground, hills and fog scale, the sky stays around the viewer. */
  private applyScale(mode: ScaleMode): void {
    const k = environmentScale(mode);
    this.ground.scale.setScalar(k);
    this.hills.scale.setScalar(k);
    const { near, far } = fogRange(mode);
    this.fog.near = near;
    this.fog.far = far;
    this.sky.scale.setScalar(k);
  }

  /** Static: nothing changes with the world state. */
  update(): void {}

  dispose(): void {
    this.unsubscribe();
    for (const mesh of [this.sky, this.ground, this.hills]) {
      mesh.geometry.dispose();
      mesh.material.dispose();
    }
  }
}
