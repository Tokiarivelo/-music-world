/**
 * StaffSystem and NoteSystem views (task 4.2, requirements 3.1–3.4): five glowing lines along the staff path with a
 * treble clef at both ends, and note glyphs (quarter, eighth, sixteenth) that slide to the playhead then fall.
 *
 * Deviation (recorded in design.md): glyphs are procedural meshes in one InstancedMesh per glyph kind, not Bravura
 * SDF text yet — no SDF text dependency in the bundle; Bravura is a Phase 4 (default look) item.
 */
import {
  BoxGeometry,
  BufferGeometry,
  CatmullRomCurve3,
  Color,
  Group,
  InstancedMesh,
  Matrix4,
  Mesh,
  MeshBasicMaterial,
  QuadraticBezierCurve3,
  Quaternion,
  SphereGeometry,
  TubeGeometry,
  Vector3,
} from 'three';
import { mergeGeometries } from 'three/examples/jsm/utils/BufferGeometryUtils.js';
import type { SpawnPlan } from '@/engine/spawn-plan';
import { staffPoint, type StaffPath } from '@/engine/staff';
import type { GlyphKind } from '@/engine/types';
import type { WorldState } from '@/engine/world-state';
import {
  CLEF_TUBE_RADIUS,
  GLYPH_CAPACITY_MAX,
  GLYPH_HEAD_SCALE,
  STAFF_TUBE_RADIUS,
  STAFF_TUBE_SEGMENTS,
} from '../constants';
import type { WorldView } from './world-view';

export const GLYPH_KINDS: readonly GlyphKind[] = ['quarter', 'eighth', 'sixteenth'];
const CLEF_U = 0.025;
/** Treble clef outline in line-gap units (x along the staff, y up; y = 0 bottom line, y = 4 top line). */
const CLEF_POINTS: ReadonlyArray<readonly [number, number]> = [
  [0.3, 1.2],
  [0, 1.55],
  [-0.45, 1.1],
  [-0.25, 0.45],
  [0.4, 0.35],
  [0.85, 1.0],
  [0.65, 2.0],
  [0.05, 2.8],
  [-0.3, 3.9],
  [0, 5.0],
  [0.35, 4.6],
  [0.2, 3.6],
  [0, 2.0],
  [-0.1, 0],
  [-0.15, -1.0],
  [-0.4, -1.3],
  [-0.6, -1.0],
];

function v(p: { x: number; y: number; z: number }): Vector3 {
  return new Vector3(p.x, p.y, p.z);
}

/** Heading (rotation about y) that aligns local +x with the staff tangent at u. */
export function staffHeading(path: StaffPath, u: number): number {
  const a = staffPoint(path, Math.max(0, u - 0.001));
  const b = staffPoint(path, Math.min(1, u + 0.001));
  return Math.atan2(-(b.z - a.z), b.x - a.x);
}

function lineCurve(path: StaffPath, line: number): QuadraticBezierCurve3 {
  const dy = line * path.lineGap;
  const lift = (p: { x: number; y: number; z: number }) => v(p).setY(p.y + dy);
  return new QuadraticBezierCurve3(lift(path.start), lift(path.control), lift(path.end));
}

function clefGeometry(path: StaffPath, u: number): BufferGeometry {
  const curve = new CatmullRomCurve3(CLEF_POINTS.map(([x, y]) => new Vector3(x * path.lineGap, y * path.lineGap, 0)));
  const geometry = new TubeGeometry(curve, 64, CLEF_TUBE_RADIUS, 6, false);
  const p = staffPoint(path, u);
  return geometry.rotateY(staffHeading(path, u)).translate(p.x, p.y, p.z);
}

/** The five lines and both clefs merged into one mesh (one draw call). */
export function buildStaffGeometry(path: StaffPath, withClefs: boolean): BufferGeometry {
  const parts: BufferGeometry[] = [];
  for (let line = 0; line < 5; line++) {
    parts.push(new TubeGeometry(lineCurve(path, line), STAFF_TUBE_SEGMENTS, STAFF_TUBE_RADIUS, 5, false));
  }
  if (withClefs) parts.push(clefGeometry(path, CLEF_U), clefGeometry(path, 1 - CLEF_U));
  const merged = mergeGeometries(parts.map((g) => g.toNonIndexed()));
  if (!merged) throw new Error('staff geometry could not be merged');
  return merged;
}

/** Glyph in line-gap units, head centred on the origin, stem up on the right, 0–2 flags. */
export function buildGlyphGeometry(kind: GlyphKind): BufferGeometry {
  const head = new SphereGeometry(0.5, 10, 6).scale(1.3, 0.9, 0.45).rotateZ(0.35);
  const stem = new BoxGeometry(0.09, 3.4, 0.09).translate(0.6, 1.7, 0);
  const parts = [head, stem];
  const flags = kind === 'eighth' ? 1 : kind === 'sixteenth' ? 2 : 0;
  for (let f = 0; f < flags; f++) {
    parts.push(new BoxGeometry(0.75, 0.16, 0.08).rotateZ(-0.7).translate(0.88, 3.05 - f * 0.55, 0));
  }
  const merged = mergeGeometries(parts.map((g) => g.toNonIndexed()));
  if (!merged) throw new Error('glyph geometry could not be merged');
  return merged;
}

export class StaffView implements WorldView {
  readonly object = new Group();
  private readonly glyphMeshes = new Map<GlyphKind, InstancedMesh>();
  private readonly disposables: Array<{ dispose(): void }> = [];
  private readonly m = new Matrix4();
  private readonly q = new Quaternion();
  private readonly pos = new Vector3();
  private readonly scale: Vector3;
  private readonly up = new Vector3(0, 1, 0);

  constructor(private readonly plan: SpawnPlan) {
    const { palette, staff } = plan.template;
    this.object.name = 'staff';
    const glow = new Color(palette.staff).multiplyScalar(staff.glow);
    const material = new MeshBasicMaterial({ color: glow });
    const staffGeometry = buildStaffGeometry(plan.staff, staff.clef === 'treble');
    this.object.add(new Mesh(staffGeometry, material));
    this.disposables.push(staffGeometry, material);

    const size = plan.staff.lineGap * GLYPH_HEAD_SCALE;
    this.scale = new Vector3(size, size, size);
    for (const kind of GLYPH_KINDS) {
      const total = plan.records.filter((r) => r.glyph === kind).length;
      if (total === 0) continue;
      const geometry = buildGlyphGeometry(kind);
      const mesh = new InstancedMesh(geometry, material, Math.min(total, GLYPH_CAPACITY_MAX));
      mesh.count = 0;
      mesh.frustumCulled = false; // instances move every frame; the bounding sphere would be stale
      this.glyphMeshes.set(kind, mesh);
      this.object.add(mesh);
      this.disposables.push(geometry);
    }
  }

  update(state: WorldState): void {
    const counts = new Map<GlyphKind, number>();
    const place = (glyph: GlyphKind, position: { x: number; y: number; z: number }, u: number) => {
      const mesh = this.glyphMeshes.get(glyph);
      const n = counts.get(glyph) ?? 0;
      if (!mesh || n >= mesh.instanceMatrix.count) return;
      this.q.setFromAxisAngle(this.up, staffHeading(this.plan.staff, u));
      this.m.compose(this.pos.set(position.x, position.y, position.z), this.q, this.scale);
      mesh.setMatrixAt(n, this.m);
      counts.set(glyph, n + 1);
    };
    for (const n of state.notesOnStaff) place(n.glyph, n.position, n.u);
    for (const f of state.fallingNotes) place(f.glyph, f.position, this.plan.staff.playheadU);
    for (const [kind, mesh] of this.glyphMeshes) {
      mesh.count = counts.get(kind) ?? 0;
      mesh.instanceMatrix.needsUpdate = true;
    }
  }

  visibleGlyphs(): number {
    let total = 0;
    for (const mesh of this.glyphMeshes.values()) total += mesh.count;
    return total;
  }

  dispose(): void {
    for (const d of this.disposables) d.dispose();
  }
}
