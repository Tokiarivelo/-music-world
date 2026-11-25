/**
 * Aurora sky view (northern-lights mode): three tall curtains of green, cyan and violet light hang above the plate, and
 * every note of the sky window (`engine/sky.ts`) is a glowing orb with a vertical ray of light, like a drop of aurora.
 * Two InstancedMeshes (orbs, rays) plus three curtain ribbons: 5 draw calls, additive, unlit. Redrawn only when the song
 * time, the layers or the mode change, so a paused song costs nothing. Nothing is shown unless `skyStore` is on.
 */
import {
  AdditiveBlending,
  Color,
  DoubleSide,
  Group,
  InstancedMesh,
  Matrix4,
  MeshBasicMaterial,
  PlaneGeometry,
  Quaternion,
  SphereGeometry,
  Vector3,
} from 'three';
import { isRecordShown } from '@/engine/layers';
import type { SpawnPlan } from '@/engine/spawn-plan';
import { SKY_CURTAINS, SKY_CURTAIN_SPACING_GAPS, SKY_HEIGHT_GAPS, skyPath } from '@/engine/sky';
import { staffPoint } from '@/engine/staff';
import type { WorldState } from '@/engine/world-state';
import { editStore } from '../edit-store';
import { radialAlphaTexture } from '../glyphs/halo-texture';
import { layerStore } from '../layer-store';
import { skyStore } from '../sky-store';
import { createAuroraCurtain, type AuroraCurtain } from './aurora-curtain';
import type { WorldView } from './world-view';

/** The colors of a real aurora: oxygen green low, cyan, then nitrogen violet and magenta high up. */
export const AURORA_COLORS = ['#35ffa0', '#3fd8ff', '#b36bff'] as const;
/** Each curtain is green low and violet / magenta high (aurora photographs). */
const AURORA_GREENS = ['#35ffa0', '#5dffb4', '#8affcc'] as const;
const AURORA_TOPS = ['#b36bff', '#ff6bd6', '#8f7bff'] as const;
const ORB_RADIUS_GAPS = 0.17;
const RAY_HEIGHT_GAPS = 5;
const SELECTED_SCALE = 1.5;
const CAPACITY_MAX = 600;

function auroraColor(pitch01: number, target: Color): Color {
  const c = Math.min(1, Math.max(0, pitch01));
  const [a, b, d] = AURORA_COLORS;
  return c < 0.5 ? target.set(a).lerp(new Color(b), c * 2) : target.set(b).lerp(new Color(d), (c - 0.5) * 2);
}

export class SkyNotesView implements WorldView {
  readonly object = new Group();
  private readonly orbs: InstancedMesh;
  private readonly rays: InstancedMesh;
  private readonly curtains: AuroraCurtain[] = [];
  private readonly disposables: Array<{ dispose(): void }> = [];
  private readonly unsubscribe: () => void;
  private lastT = Number.NaN;
  private readonly m = new Matrix4();
  private readonly q = new Quaternion();
  private readonly pos = new Vector3();
  private readonly scale = new Vector3();
  private readonly color = new Color();

  constructor(private readonly plan: SpawnPlan) {
    const path = skyPath(plan);
    const gap = path.lineGap;
    const reduced = typeof matchMedia === 'function' && matchMedia('(prefers-reduced-motion: reduce)').matches;

    // Curtains: one ribbon per aurora color, shifted sideways so the three hang side by side like in the sky.
    const a = staffPoint(path, 0.45);
    const b = staffPoint(path, 0.55);
    const len = Math.hypot(b.x - a.x, b.z - a.z) || 1;
    const nx = -(b.z - a.z) / len;
    const nz = (b.x - a.x) / len;
    for (let i = 0; i < SKY_CURTAINS; i += 1) {
      const base = AURORA_COLORS[i]!;
      const next = AURORA_COLORS[(i + 1) % AURORA_COLORS.length]!;
      const curtain = createAuroraCurtain(path, { primary: AURORA_GREENS[i % AURORA_GREENS.length]!, accent: next, secondary: AURORA_TOPS[i % AURORA_TOPS.length]! }, gap * SKY_HEIGHT_GAPS / 0.22, 1.5, reduced, true);
      const side = (i - (SKY_CURTAINS - 1) / 2) * SKY_CURTAIN_SPACING_GAPS * gap;
      curtain.mesh.position.set(nx * side, 0, nz * side);
      this.curtains.push(curtain);
      this.object.add(curtain.mesh);
      this.disposables.push(curtain);
    }

    const haloTexture = radialAlphaTexture();
    const orbGeometry = new SphereGeometry(gap * ORB_RADIUS_GAPS, 10, 8);
    const orbMaterial = new MeshBasicMaterial({ color: 0xffffff, transparent: true, opacity: 0.95, blending: AdditiveBlending, depthWrite: false });
    this.orbs = new InstancedMesh(orbGeometry, orbMaterial, CAPACITY_MAX);
    const rayGeometry = new PlaneGeometry(gap * 0.7, gap * RAY_HEIGHT_GAPS).translate(0, gap * RAY_HEIGHT_GAPS * 0.5, 0);
    const rayMaterial = new MeshBasicMaterial({
      color: 0xffffff,
      alphaMap: haloTexture,
      transparent: true,
      opacity: 0.55,
      blending: AdditiveBlending,
      depthWrite: false,
      side: DoubleSide,
    });
    this.rays = new InstancedMesh(rayGeometry, rayMaterial, CAPACITY_MAX);
    for (const mesh of [this.orbs, this.rays]) {
      mesh.count = 0;
      mesh.frustumCulled = false; // instances move every frame
      mesh.renderOrder = 3;
      this.object.add(mesh);
    }
    this.disposables.push(orbGeometry, orbMaterial, rayGeometry, rayMaterial, haloTexture);

    const redraw = () => {
      this.lastT = Number.NaN;
    };
    const offSky = skyStore.subscribe(redraw);
    const offLayers = layerStore.subscribe(redraw);
    const offEdit = editStore.subscribe(redraw);
    this.unsubscribe = () => {
      offSky();
      offLayers();
      offEdit();
    };
    this.object.visible = false;
  }

  update(state: WorldState): void {
    const on = skyStore.enabled;
    this.object.visible = on;
    if (!on || state.t === this.lastT) return;
    this.lastT = state.t;
    for (const c of this.curtains) c.update(state.t);
    const hidden = layerStore.hidden;
    const edit = editStore.state;
    const marked = new Set(edit.selection.length > 0 ? edit.selection : edit.hover ? [edit.hover] : []);
    let n = 0;
    for (const s of state.skyNotes) {
      if (n >= CAPACITY_MAX) break;
      const r = this.plan.records[s.index]!;
      if (!isRecordShown(this.plan, s.index, hidden)) continue;
      const gap = 1;
      const size = (0.45 + 0.75 * s.glow) * (marked.has(r.noteId) ? SELECTED_SCALE : 1) * (s.sounding ? 1.25 : 1) * gap;
      this.pos.set(s.position.x, s.position.y, s.position.z);
      auroraColor((r.midi - 36) / 60, this.color).multiplyScalar(0.35 + 0.9 * s.glow);
      this.m.compose(this.pos, this.q.identity(), this.scale.setScalar(size));
      this.orbs.setMatrixAt(n, this.m);
      this.orbs.setColorAt(n, this.color);
      // The ray stands on the orb and stays vertical; it stretches with the note's loudness.
      this.m.compose(this.pos, this.q.identity(), this.scale.set(size, 0.4 + 0.8 * r.velocity, size));
      this.rays.setMatrixAt(n, this.m);
      this.rays.setColorAt(n, this.color);
      n += 1;
    }
    for (const mesh of [this.orbs, this.rays]) {
      mesh.count = n;
      mesh.instanceMatrix.needsUpdate = true;
      if (mesh.instanceColor) mesh.instanceColor.needsUpdate = true;
    }
  }

  dispose(): void {
    this.unsubscribe();
    for (const d of this.disposables) d.dispose();
    this.orbs.dispose();
    this.rays.dispose();
    this.object.removeFromParent();
  }
}
