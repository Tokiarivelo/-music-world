/**
 * FxSystem view (task 4.4, requirements 1.3, 4.1): chord light arcs (one InstancedMesh of a unit arc), decorative
 * curved arcs around the staff, floating particles (one Points), and the glow level.
 *
 * Deviation (recorded in design.md): no post-processing bloom pass. An EffectComposer does not run inside a WebXR
 * session without a custom XR render path and costs a full-screen pass per eye on Quest. "Bloom" is the template's
 * `fx.bloom` glow factor applied to additive, unlit materials and modulated by the song energy.
 */
import {
  AdditiveBlending,
  BufferGeometry,
  Color,
  EllipseCurve,
  Float32BufferAttribute,
  Group,
  InstancedMesh,
  Matrix4,
  Mesh,
  MeshBasicMaterial,
  Points,
  PointsMaterial,
  Quaternion,
  TubeGeometry,
  Vector3,
  CatmullRomCurve3,
} from 'three';
import { mergeGeometries } from 'three/examples/jsm/utils/BufferGeometryUtils.js';
import { mulberry32, uniform } from '@/engine/prng';
import { staffPoint } from '@/engine/staff';
import type { SpawnPlan } from '@/engine/spawn-plan';
import type { WorldState } from '@/engine/world-state';
import {
  ARC_CAPACITY_MAX,
  ARC_HEIGHT_MAX,
  ARC_HEIGHT_MIN,
  ARC_HEIGHT_RATIO,
  CHORD_ARC_OPACITY,
  CHORD_ARC_RADIUS,
  DECOR_ARC_COUNT,
  DECOR_ARC_LIFT,
  DECOR_ARC_RADIUS,
  PARTICLE_ARC_SHARE,
  PARTICLE_COUNT,
  PARTICLE_HEIGHT,
  PARTICLE_SIZE,
  PARTICLE_SPIN,
} from '../constants';
import { radialAlphaTexture } from '../glyphs/halo-texture';
import type { WorldView } from './world-view';

const FX_SEED_KEY = 0x2b7f19;

/** Half circle from (0,0,0) to (1,0,0) with apex height 1, as a thin tube. Instances stretch it between targets. */
export function buildUnitArcGeometry(): BufferGeometry {
  const points = Array.from({ length: 17 }, (_, i) => {
    const a = (i / 16) * Math.PI;
    return new Vector3((1 - Math.cos(a)) / 2, Math.sin(a), 0);
  });
  return new TubeGeometry(new CatmullRomCurve3(points), 24, CHORD_ARC_RADIUS, 4, false);
}

/** Matrix mapping the unit arc onto from → to with a height proportional to the distance. */
export function arcMatrix(from: Vector3, to: Vector3, target = new Matrix4()): Matrix4 {
  const dir = to.clone().sub(from);
  const length = Math.max(1e-4, dir.length());
  const heading = Math.atan2(-dir.z, dir.x);
  const q = new Quaternion().setFromAxisAngle(new Vector3(0, 1, 0), heading);
  // Thickness (z) stays in world units; x stretches the span, y the apex.
  return target.compose(
    from,
    q,
    new Vector3(length, Math.min(ARC_HEIGHT_MAX, Math.max(ARC_HEIGHT_MIN, length * ARC_HEIGHT_RATIO)), 1),
  );
}

interface DecorArcs {
  tubes: BufferGeometry[];
  /** Sample points along the arcs (particles in `arcs` mode). */
  points: Vector3[];
}

/** Elliptical arc segments around the staff, in plate metres, with per-vertex colors (accent / secondary). */
export function decorArcs(plan: SpawnPlan, rng: () => number): DecorArcs {
  const { palette } = plan.template;
  const a = staffPoint(plan.staff, 0);
  const b = staffPoint(plan.staff, 1);
  const centre = new Vector3((a.x + b.x) / 2, 0, (a.z + b.z) / 2);
  const along = Math.hypot(b.x - a.x, b.z - a.z) / 2;
  const heading = Math.atan2(-(b.z - a.z), b.x - a.x);
  const colors = [new Color(palette.accent), new Color(palette.secondary).lerp(new Color(palette.staff), 0.3)];
  const tubes: BufferGeometry[] = [];
  const points: Vector3[] = [];
  for (let i = 0; i < DECOR_ARC_COUNT; i++) {
    const rx = along * uniform(rng, 0.55, 0.95);
    const rz = along * uniform(rng, 0.14, 0.36);
    const start = uniform(rng, 0, Math.PI * 2);
    const ellipse = new EllipseCurve(0, 0, rx, rz, start, start + uniform(rng, 1.4, 2.6), false, 0);
    const tilt = uniform(rng, -0.12, 0.12);
    const lift = DECOR_ARC_LIFT + 0.015 * i;
    const pts = ellipse.getPoints(64).map((p) => new Vector3(p.x, lift + p.y * Math.sin(tilt), p.y * Math.cos(tilt)));
    const tube = new TubeGeometry(new CatmullRomCurve3(pts), 64, DECOR_ARC_RADIUS, 4, false);
    tube.rotateY(heading).translate(centre.x, 0, centre.z);
    tube.deleteAttribute('uv');
    const n = tube.getAttribute('position').count;
    const c = colors[i % colors.length]!;
    const rgb = new Float32Array(n * 3);
    for (let v = 0; v < n; v++) rgb.set([c.r, c.g, c.b], v * 3);
    tube.setAttribute('color', new Float32BufferAttribute(rgb, 3));
    tubes.push(tube);
    for (const p of pts)
      points.push(
        p
          .clone()
          .applyAxisAngle(new Vector3(0, 1, 0), heading)
          .add(centre),
      );
  }
  return { tubes, points };
}

export class FxView implements WorldView {
  readonly object = new Group();
  private readonly arcs: InstancedMesh;
  private readonly arcMaterial: MeshBasicMaterial;
  private readonly decorMaterial: MeshBasicMaterial;
  private readonly particles: Points;
  private readonly particleMaterial: PointsMaterial;
  private readonly arcColor: Color;
  private readonly disposables: Array<{ dispose(): void }> = [];
  private readonly from = new Vector3();
  private readonly to = new Vector3();
  private readonly m = new Matrix4();
  private readonly bloom: number;

  constructor(plan: SpawnPlan) {
    const { palette, fx, terrain } = plan.template;
    this.object.name = 'fx';
    this.bloom = fx.bloom;

    const capacity = Math.min(
      ARC_CAPACITY_MAX,
      Math.max(
        1,
        plan.groups.reduce((n, g) => n + Math.max(0, g.recordIndices.length - 1), 0),
      ),
    );
    const arcGeometry = buildUnitArcGeometry();
    this.arcColor = new Color(palette.accent).lerp(new Color(palette.staff), 0.25);
    this.arcMaterial = new MeshBasicMaterial({
      color: this.arcColor.clone(),
      transparent: true,
      blending: AdditiveBlending,
      depthWrite: false,
    });
    this.arcs = new InstancedMesh(arcGeometry, this.arcMaterial, capacity);
    this.arcs.count = 0;
    this.arcs.frustumCulled = false;
    this.object.add(this.arcs);
    this.disposables.push(arcGeometry, this.arcMaterial);

    // Decorative light arcs around the staff (requirement 6.1): ellipse segments centred on the staff middle, major
    // axis along the staff, slightly tilted, alternating accent / secondary, merged into one mesh with vertex colors.
    this.decorMaterial = new MeshBasicMaterial({
      vertexColors: true,
      transparent: true,
      opacity: 0.5,
      blending: AdditiveBlending,
      depthWrite: false,
    });
    const rng = mulberry32(plan.seed ^ FX_SEED_KEY);
    const decor = decorArcs(plan, rng);
    const decorGeometry = mergeGeometries(decor.tubes);
    if (decorGeometry) {
      this.object.add(new Mesh(decorGeometry, this.decorMaterial));
      this.disposables.push(decorGeometry);
    }
    this.disposables.push(this.decorMaterial);

    // Particles (requirement 6.2): round soft dots. In `arcs` mode most of them sit on the decor arcs, the rest float
    // low around the plate; `dust` spreads all of them.
    const half = terrain.size / 2;
    const dot = radialAlphaTexture();
    const onArcs = fx.particles === 'arcs' ? Math.round(PARTICLE_COUNT * PARTICLE_ARC_SHARE) : 0;
    const positions = new Float32Array(PARTICLE_COUNT * 3);
    const colors = new Float32Array(PARTICLE_COUNT * 3);
    const tints = [new Color(palette.staff), new Color(palette.accent), new Color(palette.secondary)];
    for (let i = 0; i < PARTICLE_COUNT; i++) {
      let p: Vector3;
      if (i < onArcs && decor.points.length > 0) {
        p = decor.points[Math.floor(rng() * decor.points.length)]!.clone();
        p.y += uniform(rng, 0, 0.06);
      } else {
        p = new Vector3(uniform(rng, -half, half), uniform(rng, 0.08, PARTICLE_HEIGHT), uniform(rng, -half, half));
      }
      positions.set([p.x, p.y, p.z], i * 3);
      const tint = tints[Math.floor(rng() * tints.length)]!;
      colors.set([tint.r, tint.g, tint.b], i * 3);
    }
    const particleGeometry = new BufferGeometry();
    particleGeometry.setAttribute('position', new Float32BufferAttribute(positions, 3));
    particleGeometry.setAttribute('color', new Float32BufferAttribute(colors, 3));
    this.particleMaterial = new PointsMaterial({
      vertexColors: true,
      alphaMap: dot,
      size: PARTICLE_SIZE,
      transparent: true,
      opacity: 0.7,
      blending: AdditiveBlending,
      depthWrite: false,
    });
    this.particles = new Points(particleGeometry, this.particleMaterial);
    this.particles.visible = fx.particles !== 'none';
    this.object.add(this.particles);
    this.disposables.push(particleGeometry, this.particleMaterial, dot);
  }

  /** Glow factor at a given energy: the template bloom, brighter in loud sections. */
  glow(energy: number): number {
    return this.bloom * (0.6 + 0.8 * energy);
  }

  update(state: WorldState): void {
    const glow = this.glow(state.pulses.energy);
    let n = 0;
    let intensity = 0;
    for (const arc of state.arcs) {
      if (n >= this.arcs.instanceMatrix.count) break;
      this.from.set(arc.from.x, arc.from.y, arc.from.z);
      this.to.set(arc.to.x, arc.to.y, arc.to.z);
      this.arcs.setMatrixAt(n++, arcMatrix(this.from, this.to, this.m));
      intensity = Math.max(intensity, arc.intensity);
    }
    this.arcs.count = n;
    this.arcs.instanceMatrix.needsUpdate = true;
    this.arcMaterial.opacity = Math.min(1, intensity) * CHORD_ARC_OPACITY;
    this.arcMaterial.color.copy(this.arcColor).multiplyScalar(glow);
    this.decorMaterial.opacity = Math.min(1, 0.25 + 0.4 * glow + 0.3 * state.pulses.beat);
    this.particleMaterial.opacity = Math.min(1, 0.35 + 0.4 * glow);
    // Particles drift with song time (seek-exact), never with frame deltas.
    this.particles.rotation.y = state.t * PARTICLE_SPIN;
  }

  visibleArcs(): number {
    return this.arcs.count;
  }

  dispose(): void {
    for (const d of this.disposables) d.dispose();
  }
}
