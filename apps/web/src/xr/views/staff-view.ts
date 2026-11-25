/**
 * StaffSystem and NoteSystem views (03-world-engine-core task 4.2; 04-default-template requirements 3 and 4): five
 * glowing lines along the staff path with a soft additive halo, a Bravura G clef at both ends, and Bravura note glyphs
 * (quarter, eighth, sixteenth) that slide to the playhead then fall, each with a halo quad. One InstancedMesh per
 * glyph kind plus one for all halos; glow comes from unlit additive materials (no post-processing).
 */
import {
  AdditiveBlending,
  BufferGeometry,
  Color,
  DoubleSide,
  Group,
  InstancedMesh,
  Matrix4,
  Mesh,
  MeshBasicMaterial,
  Object3D,
  PlaneGeometry,
  QuadraticBezierCurve3,
  Quaternion,
  TubeGeometry,
  Vector3,
} from 'three';
import { mergeGeometries } from 'three/examples/jsm/utils/BufferGeometryUtils.js';
import { isRecordShown } from '@/engine/layers';
import type { SpawnPlan } from '@/engine/spawn-plan';
import { staffNotePosition, staffPoint, type StaffPath } from '@/engine/staff';
import { staffUOf as staffUOfMidi } from '@/engine/spawn-plan';
import type { GlyphKind } from '@/engine/types';
import type { WorldState } from '@/engine/world-state';
import { editStore } from '../edit-store';
import { LAYER_COLORS } from '@/engine/layers';
import type { Stem } from '@/engine/types';
import { layerStore } from '../layer-store';
import {
  CLEF_SCALE,
  GLYPH_CAPACITY_MAX,
  GLYPH_HALO_OPACITY,
  GLYPH_SCALE,
  STAFF_HALO_OPACITY,
  STAFF_HALO_RADIUS,
  STAFF_TUBE_RADIUS,
  STAFF_TUBE_SEGMENTS,
} from '../constants';
import { skyStore } from '../sky-store';
import { createAuroraCurtain, type AuroraCurtain } from './aurora-curtain';
import { bravuraGeometry, noteGlyphGeometry } from '../glyphs/glyph-geometry';
import { radialAlphaTexture } from '../glyphs/halo-texture';
import type { WorldView } from './world-view';

export const GLYPH_KINDS: readonly GlyphKind[] = ['quarter', 'eighth', 'sixteenth'];
const CLEF_U = 0.012;
/** Extra halo slots for the editor marks (selected notes, hover, ghost). */
const MARK_CAPACITY = 64;
/** The G clef's origin sits on the G line: the second line from the bottom. */
const CLEF_LINE = 1;
/** Halo quad around a glyph, in staff spaces: centred between the notehead and the stem top. */
const HALO_SIZE = { w: 3.2, h: 5.2, x: 0.35, y: 1.5 } as const;

function v(p: { x: number; y: number; z: number }): Vector3 {
  return new Vector3(p.x, p.y, p.z);
}

/** Heading (rotation about y) that aligns local +x with the staff tangent at u. */
export function staffHeading(path: StaffPath, u: number): number {
  const a = staffPoint(path, Math.max(0, u - 0.001));
  const b = staffPoint(path, Math.min(1, u + 0.001));
  return Math.atan2(-(b.z - a.z), b.x - a.x);
}

function lineCurve(path: StaffPath, line: number, yOffset = 0): QuadraticBezierCurve3 {
  const dy = line * path.lineGap + yOffset;
  const lift = (p: { x: number; y: number; z: number }) => v(p).setY(p.y + dy);
  return new QuadraticBezierCurve3(lift(path.start), lift(path.control), lift(path.end));
}

/** Bravura G clef standing on the staff at u (requirement 3.2). */
function clefGeometry(path: StaffPath, u: number, yOffset = 0): BufferGeometry {
  const size = path.lineGap * CLEF_SCALE;
  const geometry = bravuraGeometry('gClef').toNonIndexed().scale(size, size, size);
  geometry.translate(0, CLEF_LINE * path.lineGap + yOffset, 0);
  const p = staffPoint(path, u);
  return geometry.rotateY(staffHeading(path, u)).translate(p.x, p.y, p.z);
}

function stripUv(g: BufferGeometry): BufferGeometry {
  g.deleteAttribute('uv');
  g.deleteAttribute('normal');
  return g;
}

/** The five lines and both clefs merged into one mesh (one draw call). */
export function buildStaffGeometry(
  path: StaffPath,
  withClefs: boolean,
  radius = STAFF_TUBE_RADIUS,
  yOffset = 0,
): BufferGeometry {
  const parts: BufferGeometry[] = [];
  for (let line = 0; line < 5; line++) {
    parts.push(stripUv(new TubeGeometry(lineCurve(path, line, yOffset), STAFF_TUBE_SEGMENTS, radius, 5, false).toNonIndexed()));
  }
  if (withClefs) parts.push(stripUv(clefGeometry(path, CLEF_U, yOffset)), stripUv(clefGeometry(path, 1 - CLEF_U - 0.02, yOffset)));
  const merged = mergeGeometries(parts);
  if (!merged) throw new Error('staff geometry could not be merged');
  return merged;
}

/** Bravura note glyph in staff spaces, notehead centred on the origin (requirement 4.1). */
export function buildGlyphGeometry(kind: GlyphKind): BufferGeometry {
  return noteGlyphGeometry(kind);
}

/** A note's glyph color: its own (or its line's) color, else the color of its layer; scenery has none. */
function hexOf(r: { colorHex: string | null; stem: Stem | null }): string | null {
  return r.colorHex ?? (r.stem ? LAYER_COLORS[r.stem] : null);
}

export class StaffView implements WorldView {
  readonly object = new Group();
  private readonly glyphMeshes = new Map<GlyphKind, InstancedMesh>();
  private readonly halos: InstancedMesh;
  private readonly disposables: Array<{ dispose(): void }> = [];
  private readonly m = new Matrix4();
  private readonly q = new Quaternion();
  private readonly pos = new Vector3();
  private readonly scale: Vector3;
  private readonly markScale = new Vector3();
  private readonly indexOf = new Map<string, number>();
  private readonly tinted: boolean;
  private readonly glow: Color;
  private readonly tint = new Color();
  private readonly up = new Vector3(0, 1, 0);
  /** Reused per update (07-xr-mode requirement 6.2: no steady-state allocation). */
  private readonly counts = new Map<GlyphKind, number>();
  private haloCount = 0;
  private lastT = Number.NaN;
  private readonly curtain: AuroraCurtain | null = null;
  /** Lines, halo, clef and curtain: hidden with the `staff` layer. */
  private readonly staffParts: Object3D[] = [];
  private unsubscribe: () => void = () => {};

  constructor(private readonly plan: SpawnPlan) {
    const { palette, staff } = plan.template;
    this.object.name = 'staff';
    const mainLine = plan.lines.find((l) => l.id === 'main');
    const glow = new Color(mainLine?.color ?? palette.staff).multiplyScalar(staff.glow);
    const material = new MeshBasicMaterial({ color: glow, side: DoubleSide });
    const staffGeometry = buildStaffGeometry(plan.staff, staff.clef === 'treble' && (mainLine?.clef ?? 'treble') === 'treble');
    const lines = new Mesh(staffGeometry, material);
    this.staffParts.push(lines);
    this.object.add(lines);
    this.disposables.push(staffGeometry, material);

    // Soft halo of the lines: the same curves as wider, faint additive tubes (fake bloom, requirement 3.1).
    const haloColor = new Color(palette.staff).lerp(new Color(palette.secondary), 0.35);
    const haloMaterial = new MeshBasicMaterial({
      color: haloColor,
      transparent: true,
      opacity: STAFF_HALO_OPACITY * staff.glow,
      blending: AdditiveBlending,
      depthWrite: false,
    });
    const haloGeometry = buildStaffGeometry(plan.staff, false, STAFF_HALO_RADIUS);
    const halo = new Mesh(haloGeometry, haloMaterial);
    this.staffParts.push(halo);
    this.object.add(halo);
    this.disposables.push(haloGeometry, haloMaterial);

    // Voice lines of the listener (I9): a full staff each, lifted above the main one, in its own color.
    for (const line of plan.lines) {
      if (line.id === 'main') continue;
      const color = new Color(line.color ?? palette.staff).multiplyScalar(staff.glow);
      const lineMaterial = new MeshBasicMaterial({ color, side: DoubleSide });
      const lineGeometry = buildStaffGeometry(plan.staff, line.clef === 'treble', STAFF_TUBE_RADIUS, line.offsetY);
      const mesh = new Mesh(lineGeometry, lineMaterial);
      this.staffParts.push(mesh);
      this.object.add(mesh);
      this.disposables.push(lineGeometry, lineMaterial);
    }

    if (staff.style === 'aurora') {
      const reduced = typeof matchMedia === 'function' && matchMedia('(prefers-reduced-motion: reduce)').matches;
      this.curtain = createAuroraCurtain(plan.staff, palette, plan.template.terrain.size, staff.glow, reduced);
      this.staffParts.push(this.curtain.mesh);
      this.object.add(this.curtain.mesh);
      this.disposables.push(this.curtain);
    }

    for (const r of plan.records) this.indexOf.set(r.noteId, r.index);
    // Own colors (I9): when any note has one, glyphs use a white material and an instance color per note, so the default
    // glow color is unchanged for the others. Plans without custom colors keep the single shared material.
    this.glow = glow;
    this.tinted = true; // every note carries its layer color (or its own), see `hexOf`
    let glyphMaterial: MeshBasicMaterial = material;
    if (this.tinted) {
      glyphMaterial = new MeshBasicMaterial({ color: 0xffffff, side: DoubleSide });
      this.disposables.push(glyphMaterial);
    }
    const size = plan.staff.lineGap * GLYPH_SCALE;
    this.scale = new Vector3(size, size, size);
    let capacity = 0;
    for (const kind of GLYPH_KINDS) {
      const total = plan.records.filter((r) => r.glyph === kind).length;
      if (total === 0) continue;
      const geometry = buildGlyphGeometry(kind);
      const mesh = new InstancedMesh(geometry, glyphMaterial, Math.min(total, GLYPH_CAPACITY_MAX) + 1);
      mesh.count = 0;
      mesh.frustumCulled = false; // instances move every frame; the bounding sphere would be stale
      this.glyphMeshes.set(kind, mesh);
      this.object.add(mesh);
      this.disposables.push(geometry);
      capacity += mesh.instanceMatrix.count;
    }

    // One halo quad per visible glyph (requirement 4.2), all in one InstancedMesh.
    const haloTexture = radialAlphaTexture();
    const glyphHaloMaterial = new MeshBasicMaterial({
      color: haloColor,
      alphaMap: haloTexture,
      transparent: true,
      opacity: GLYPH_HALO_OPACITY * staff.glow,
      blending: AdditiveBlending,
      depthWrite: false,
      side: DoubleSide,
    });
    const quad = new PlaneGeometry(HALO_SIZE.w, HALO_SIZE.h).translate(HALO_SIZE.x, HALO_SIZE.y, -0.01);
    this.halos = new InstancedMesh(quad, glyphHaloMaterial, Math.max(1, capacity) + MARK_CAPACITY);
    this.halos.count = 0;
    this.halos.frustumCulled = false;
    this.object.add(this.halos);
    this.disposables.push(quad, haloTexture, glyphHaloMaterial);
    const redraw = () => {
      this.lastT = Number.NaN;
    };
    const offLayers = layerStore.subscribe(redraw);
    const offEdit = editStore.subscribe(redraw);
    const offSky = skyStore.subscribe(redraw);
    this.unsubscribe = () => {
      offSky();
      offLayers();
      offEdit();
    };
  }

  update(state: WorldState): void {
    if (state.t === this.lastT) return; // paused: nothing changed, skip the GPU upload
    this.lastT = state.t;
    this.curtain?.update(state.t);
    const hidden = layerStore.hidden;
    const sky = skyStore.enabled; // the aurora sky shows the notes itself: no staff, no sliding or falling glyphs
    for (const part of this.staffParts) part.visible = !hidden.has('staff') && !sky;
    this.counts.clear();
    this.haloCount = 0;
    if (!sky) for (const n of state.notesOnStaff) if (isRecordShown(this.plan, n.index, hidden)) this.place(n.glyph, n.position, n.u, hexOf(this.plan.records[n.index]!));
    for (const f of sky ? [] : state.fallingNotes) {
      if (isRecordShown(this.plan, f.index, hidden)) this.place(f.glyph, f.position, this.plan.staff.playheadU, hexOf(this.plan.records[f.index]!));
    }
    if (!sky) this.placeEditMarks(state);
    for (const [kind, mesh] of this.glyphMeshes) {
      mesh.count = this.counts.get(kind) ?? 0;
      mesh.instanceMatrix.needsUpdate = true;
      if (mesh.instanceColor) mesh.instanceColor.needsUpdate = true;
    }
    this.halos.count = this.haloCount;
    this.halos.instanceMatrix.needsUpdate = true;
  }

  /** Editor marks (I9): a larger halo behind the hovered / selected notes and a ghost glyph at the drag target. */
  private placeEditMarks(state: WorldState): void {
    const edit = editStore.state;
    if (!edit.enabled) return;
    const mark = (noteId: string, midi: number | null, scale: number): void => {
      const index = this.indexOf.get(noteId);
      const r = index === undefined ? undefined : this.plan.records[index];
      if (!r) return;
      const n = state.notesOnStaff.find((x) => x.index === r.index);
      const f = state.fallingNotes.find((x) => x.index === r.index);
      if (!n && !f) return;
      const u = n ? n.u : this.plan.staff.playheadU;
      const staffU = midi === null ? r.staffU : staffUOfMidi(midi);
      const position = staffNotePosition(this.plan.staff, u, staffU, r.lineY);
      this.q.setFromAxisAngle(this.up, staffHeading(this.plan.staff, u));
      this.m.compose(this.pos.set(position.x, position.y, position.z), this.q, this.markScale.setScalar(this.scale.x * scale));
      if (midi !== null) {
        const mesh = this.glyphMeshes.get(r.glyph);
        const c = this.counts.get(r.glyph) ?? 0;
        if (mesh && c < mesh.instanceMatrix.count) {
          mesh.setMatrixAt(c, this.m);
          if (this.tinted) mesh.setColorAt(c, this.colorOf(hexOf(r)));
          this.counts.set(r.glyph, c + 1);
        }
      }
      if (this.haloCount < this.halos.instanceMatrix.count) this.halos.setMatrixAt(this.haloCount++, this.m);
    };
    const marked = edit.selection.length > 0 ? edit.selection : edit.hover ? [edit.hover] : [];
    for (const id of marked) mark(id, null, 1.35);
    if (edit.ghost) mark(edit.ghost.noteId, edit.ghost.midi, 1);
  }

  private place(glyph: GlyphKind, position: { x: number; y: number; z: number }, u: number, hex: string | null = null): void {
    const mesh = this.glyphMeshes.get(glyph);
    const n = this.counts.get(glyph) ?? 0;
    if (!mesh || n >= mesh.instanceMatrix.count) return;
    this.q.setFromAxisAngle(this.up, staffHeading(this.plan.staff, u));
    this.m.compose(this.pos.set(position.x, position.y, position.z), this.q, this.scale);
    mesh.setMatrixAt(n, this.m);
    if (this.tinted) mesh.setColorAt(n, this.colorOf(hex));
    this.counts.set(glyph, n + 1);
    if (this.haloCount < this.halos.instanceMatrix.count) this.halos.setMatrixAt(this.haloCount++, this.m);
  }

  /** Glyph color: the note's own color times the staff glow, else the shared glow color. */
  private colorOf(hex: string | null): Color {
    return hex ? this.tint.set(hex).multiplyScalar(this.plan.template.staff.glow) : this.tint.copy(this.glow);
  }

  visibleHalos(): number {
    return this.halos.count;
  }

  visibleGlyphs(): number {
    let total = 0;
    for (const mesh of this.glyphMeshes.values()) total += mesh.count;
    return total;
  }

  dispose(): void {
    this.unsubscribe();
    for (const d of this.disposables) d.dispose();
  }
}
