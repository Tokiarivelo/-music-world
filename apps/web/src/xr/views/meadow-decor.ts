/**
 * Lush stylized meadow scenery inspired by vibrant nature reference (7.webp):
 * - A winding azure/turquoise river flowing gracefully through the meadow valley.
 * - Multi-colored wildflower carpets (daisies, pink poppies, buttercups, white petals, lavender).
 * - Smooth natural riverbank boulders and grassy knoll rocks with warm mossy tops.
 * - A rustic cobblestone/dirt trail meandering alongside the river.
 *
 * Implemented efficiently via InstancedMesh and procedural ribbons (3 draw calls total).
 */
import {
  AdditiveBlending,
  BufferGeometry,
  CatmullRomCurve3,
  Color,
  DodecahedronGeometry,
  DoubleSide,
  DynamicDrawUsage,
  Float32BufferAttribute,
  Group,
  InstancedMesh,
  Matrix4,
  Mesh,
  MeshBasicMaterial,
  PlaneGeometry,
  Quaternion,
  ShaderMaterial,
  Vector3,
} from 'three';
import { hashSeed, mulberry32, type Rng } from '@/engine/prng';
import type { WorldState } from '@/engine/world-state';
import { environmentScale, scaleStore, type ScaleMode } from '../scale';
import type { WorldView } from './world-view';

const RIVER_VERTEX = /* glsl */ `
varying vec2 vUv;
varying vec3 vWorldPos;
void main() {
  vUv = uv;
  vec4 wp = modelMatrix * vec4(position, 1.0);
  vWorldPos = wp.xyz;
  gl_Position = projectionMatrix * viewMatrix * wp;
}
`;

const RIVER_FRAGMENT = /* glsl */ `
uniform vec3 uColorDeep;
uniform vec3 uColorShallow;
uniform vec3 uFoamColor;
uniform float uTime;
varying vec2 vUv;
varying vec3 vWorldPos;

void main() {
  // Animated water shimmer streaks along the river direction (u)
  float flow = vUv.x * 12.0 - uTime * 0.45;
  float waves = sin(flow + sin(vUv.y * 8.0 + uTime * 0.3) * 2.5);
  waves += sin(flow * 1.8 - vUv.y * 6.0 + uTime * 0.7) * 0.5;

  // Shore foam: edges of the river (v = 0 and v = 1) have subtle white foam streaks
  float edgeDist = min(vUv.y, 1.0 - vUv.y);
  float shoreFoam = smoothstep(0.18, 0.02, edgeDist) * (0.4 + 0.6 * sin(flow * 3.0 + uTime * 1.2));

  // Blend from deep crystal blue to shallow turquoise
  vec3 water = mix(uColorDeep, uColorShallow, 0.45 + 0.35 * waves);
  water = mix(water, uFoamColor, shoreFoam * 0.7);

  // Soft sparkle highlights
  float sparkle = pow(max(0.0, sin(flow * 4.0 + vUv.y * 14.0)), 8.0) * 0.35;
  water += uFoamColor * sparkle;

  gl_FragColor = vec4(water, 0.92);
  #include <colorspace_fragment>
}
`;

/** Control points for the river curve meandering through the landscape. */
const RIVER_POINTS = [
  new Vector3(-45, 0.03, -120),
  new Vector3(-32, 0.03, -70),
  new Vector3(-12, 0.03, -25),
  new Vector3(14, 0.03, 20),
  new Vector3(36, 0.03, 75),
  new Vector3(58, 0.03, 135),
];

/** Control points for the rustic dirt/cobblestone path meandering through the meadow. */
const PATH_POINTS = [
  new Vector3(-38, 0.02, -115),
  new Vector3(-20, 0.02, -60),
  new Vector3(2, 0.02, -10),
  new Vector3(28, 0.02, 40),
  new Vector3(48, 0.02, 105),
];

/** Builds a 2D ribbon mesh along a 3D spline curve. */
function buildRibbonGeometry(points: Vector3[], width: number, segments = 64): BufferGeometry {
  const curve = new CatmullRomCurve3(points);
  const divisions = segments;
  const positions: number[] = [];
  const uvs: number[] = [];
  const indices: number[] = [];
  const up = new Vector3(0, 1, 0);
  const normal = new Vector3();

  for (let i = 0; i <= divisions; i++) {
    const t = i / divisions;
    const pt = curve.getPoint(t);
    const tangent = curve.getTangent(t).normalize();
    normal.crossVectors(tangent, up).normalize();

    const halfW = width * (0.85 + 0.25 * Math.sin(t * Math.PI * 3));
    const left = pt.clone().addScaledVector(normal, -halfW);
    const right = pt.clone().addScaledVector(normal, halfW);

    positions.push(left.x, left.y, left.z);
    positions.push(right.x, right.y, right.z);

    uvs.push(t, 0);
    uvs.push(t, 1);

    if (i < divisions) {
      const a = i * 2;
      const b = i * 2 + 1;
      const c = (i + 1) * 2;
      const d = (i + 1) * 2 + 1;
      indices.push(a, b, c);
      indices.push(b, d, c);
    }
  }

  const geometry = new BufferGeometry();
  geometry.setAttribute('position', new Float32BufferAttribute(positions, 3));
  geometry.setAttribute('uv', new Float32BufferAttribute(uvs, 2));
  geometry.setIndex(indices);
  geometry.computeVertexNormals();
  return geometry;
}

/** Stylized wildflower blossom geometry (5 petal cross with center). */
function buildBlossomGeometry(): BufferGeometry {
  const geom = new PlaneGeometry(0.42, 0.42, 1, 1).rotateX(-Math.PI / 2);
  return geom;
}

/** Stylized low-poly deformed rock geometry. */
function buildRockGeometry(seed: number): BufferGeometry {
  const geom = new DodecahedronGeometry(1.0, 1);
  const pos = geom.getAttribute('position');
  const rng = mulberry32(hashSeed(seed, 'rock-mesh'));
  for (let i = 0; i < pos.count; i++) {
    const x = pos.getX(i);
    const y = pos.getY(i);
    const z = pos.getZ(i);
    // Flatten bottom slightly, add natural asymmetry
    const deform = 0.82 + 0.36 * rng();
    pos.setXYZ(i, x * deform * 1.25, Math.max(0.02, y * deform * 0.75), z * deform * 1.25);
  }
  geom.computeVertexNormals();
  return geom;
}

/** Palette of vibrant wildflower blossom colors inspired by 7.webp. */
const WILDFLOWER_PALETTE: readonly string[] = [
  '#ffeb3b', // sunny buttercup yellow
  '#fdd835', // golden daisy
  '#ff4081', // vibrant wild rose pink
  '#f06292', // soft poppy blossom
  '#ffffff', // pure white daisy
  '#f5f5f5', // porcelain white petal
  '#ab47bc', // wild lavender purple
  '#ba68c8', // lilac blossom
  '#ff9800', // vibrant marigold orange
];

export class MeadowDecorView implements WorldView {
  readonly object = new Group();
  private readonly river: Mesh<BufferGeometry, ShaderMaterial>;
  private readonly path: Mesh<BufferGeometry, MeshBasicMaterial>;
  private readonly flowers: InstancedMesh;
  private readonly rocks: InstancedMesh;
  private readonly disposables: Array<{ dispose(): void }> = [];
  private readonly unsubscribeScale: () => void;

  constructor(seed: number) {
    this.object.name = 'meadow-decor';
    const rng = mulberry32(hashSeed(seed, 'meadow-decor-seed'));

    // 1. Winding crystal turquoise river
    const riverGeom = buildRibbonGeometry(RIVER_POINTS, 9.5, 72);
    const riverMat = new ShaderMaterial({
      vertexShader: RIVER_VERTEX,
      fragmentShader: RIVER_FRAGMENT,
      uniforms: {
        uColorDeep: { value: new Color('#0077b6') },
        uColorShallow: { value: new Color('#48cae4') },
        uFoamColor: { value: new Color('#ffffff') },
        uTime: { value: 0 },
      },
      side: DoubleSide,
      transparent: true,
      depthWrite: false,
    });
    this.river = new Mesh(riverGeom, riverMat);
    this.river.renderOrder = 2;
    this.disposables.push(riverGeom, riverMat);

    // 2. Rustic cobblestone / dirt path meandering through the meadow
    const pathGeom = buildRibbonGeometry(PATH_POINTS, 3.8, 56);
    const pathMat = new MeshBasicMaterial({
      color: new Color('#c7a75c').lerp(new Color('#d7ccc8'), 0.45),
      side: DoubleSide,
      depthWrite: false,
    });
    this.path = new Mesh(pathGeom, pathMat);
    this.path.renderOrder = 1;
    this.disposables.push(pathGeom, pathMat);

    // 3. Wildflowers instanced mesh
    const FLOWER_COUNT = 720;
    const blossomGeom = buildBlossomGeometry();
    const flowerMat = new MeshBasicMaterial({ vertexColors: true, side: DoubleSide, depthWrite: false });
    this.flowers = new InstancedMesh(blossomGeom, flowerMat, FLOWER_COUNT);
    this.flowers.instanceMatrix.setUsage(DynamicDrawUsage);
    this.flowers.renderOrder = 3;
    this.disposables.push(blossomGeom, flowerMat);

    const m = new Matrix4();
    const q = new Quaternion();
    const up = new Vector3(0, 1, 0);
    const pos = new Vector3();
    const sc = new Vector3();
    const color = new Color();

    // Scatter wildflowers in natural patches across the meadow (along stream, paths, grassy knolls)
    const curveRiver = new CatmullRomCurve3(RIVER_POINTS);
    for (let i = 0; i < FLOWER_COUNT; i++) {
      // Pick a spot along the river / path with organic lateral spread
      const t = rng();
      const pt = curveRiver.getPoint(t);
      const spread = (rng() - 0.5) * 85;
      const lateralDist = Math.abs(spread) < 6 ? (spread < 0 ? -7 - rng() * 12 : 7 + rng() * 12) : spread;
      const x = pt.x + lateralDist;
      const z = pt.z + (rng() - 0.5) * 22;
      const y = 0.06 + rng() * 0.04;

      const scale = 0.75 + 0.65 * rng();
      q.setFromAxisAngle(up, rng() * Math.PI * 2);
      sc.set(scale, scale, scale);
      pos.set(x, y, z);
      m.compose(pos, q, sc);
      this.flowers.setMatrixAt(i, m);

      const hex = WILDFLOWER_PALETTE[Math.floor(rng() * WILDFLOWER_PALETTE.length)]!;
      color.set(hex);
      this.flowers.setColorAt(i, color);
    }
    this.flowers.instanceMatrix.needsUpdate = true;
    if (this.flowers.instanceColor) this.flowers.instanceColor.needsUpdate = true;

    // 4. Natural riverbank boulders and grassy knoll rocks
    const ROCK_COUNT = 90;
    const rockGeom = buildRockGeometry(seed);
    const rockMat = new MeshBasicMaterial({ vertexColors: true });
    this.rocks = new InstancedMesh(rockGeom, rockMat, ROCK_COUNT);
    this.rocks.instanceMatrix.setUsage(DynamicDrawUsage);
    this.disposables.push(rockGeom, rockMat);

    const rockColors = [
      new Color('#78909c'), // cool granite
      new Color('#607d8b'), // slate grey
      new Color('#8d6e63'), // warm river stone
      new Color('#689f38'), // mossy crest
    ];

    for (let i = 0; i < ROCK_COUNT; i++) {
      const t = rng();
      const pt = curveRiver.getPoint(t);
      // Half the rocks cluster right along the shoreline, half on grassy mounds
      const isShore = rng() < 0.55;
      const offset = isShore ? (rng() < 0.5 ? -5.5 - rng() * 3.5 : 5.5 + rng() * 3.5) : (rng() - 0.5) * 110;
      const x = pt.x + offset;
      const z = pt.z + (rng() - 0.5) * 35;
      const rSize = (isShore ? 0.7 : 1.2) * (0.65 + 0.75 * rng());

      pos.set(x, 0.02, z);
      q.setFromAxisAngle(up, rng() * Math.PI * 2);
      sc.set(rSize * (0.8 + 0.4 * rng()), rSize * (0.7 + 0.5 * rng()), rSize * (0.8 + 0.4 * rng()));
      m.compose(pos, q, sc);
      this.rocks.setMatrixAt(i, m);

      const baseCol = rockColors[Math.floor(rng() * rockColors.length)]!.clone();
      // Add subtle warm tone
      baseCol.lerp(new Color('#90a4ae'), rng() * 0.35);
      this.rocks.setColorAt(i, baseCol);
    }
    this.rocks.instanceMatrix.needsUpdate = true;
    if (this.rocks.instanceColor) this.rocks.instanceColor.needsUpdate = true;

    this.object.add(this.path, this.river, this.flowers, this.rocks);
    this.applyScale(scaleStore.mode);
    this.unsubscribeScale = scaleStore.subscribe((mode) => this.applyScale(mode));
  }

  private applyScale(mode: ScaleMode): void {
    const k = environmentScale(mode);
    this.object.scale.setScalar(k);
  }

  update(state: WorldState): void {
    this.river.material.uniforms.uTime!.value = state.t;
  }

  dispose(): void {
    this.unsubscribeScale();
    for (const d of this.disposables) d.dispose();
  }
}
