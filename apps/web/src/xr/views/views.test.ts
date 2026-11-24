import { describe, expect, it } from 'vitest';
import { AdditiveBlending, Matrix4, Vector3, type InstancedMesh, type Object3D } from 'three';
import { mulberry32 } from '@/engine/prng';
import { DEMO_ANALYSIS as demo } from '@/engine/__fixtures__/demo-analysis';
import { buildSpawnPlan } from '@/engine/spawn-plan';
import { worldStateAt } from '@/engine/world-state';
import { DEFAULT_TEMPLATE } from '@/templates/default';
import { ARC_HEIGHT_MAX, DECOR_ARC_COUNT, PARTICLE_SPIN, SHAPE_TRIANGLE_BUDGET } from '../constants';
import { buildingMaterial, spikeMaterial } from '../shapes/city-materials';
import { gradientColor } from '../palette';
import { buildShapeGeometry, triangleCount } from '../shapes/builtin-shapes';
import { arcMatrix, buildUnitArcGeometry, decorArcs, FxView } from './fx-view';
import { buildGlyphGeometry, GLYPH_KINDS, StaffView } from './staff-view';
import { StructureView } from './structure-view';
import { buildTerrainField, crackNetwork, fieldHeight } from '../terrain-field';
import { TerrainView } from './terrain-view';

const plan = buildSpawnPlan(demo, DEFAULT_TEMPLATE, 1);
const KINDS = ['terrain_ridge', 'building', 'spike', 'crystal', 'cluster', 'recipe:tower'] as const;

/** Draw calls of a view tree: every visible Mesh / InstancedMesh / Points / LineSegments. */
function drawCalls(root: Object3D): number {
  let n = 0;
  root.traverse((o) => {
    const r = o as Object3D & { isMesh?: boolean; isPoints?: boolean; isLine?: boolean };
    if (r.visible && (r.isMesh || r.isPoints || r.isLine)) n++;
  });
  return n;
}

describe('shape geometry budgets (testing.md: recipe builder triangle counts)', () => {
  it.each(KINDS)('%s stays under the per-instance triangle budget, base at y = 0, height 1', (kind) => {
    const g = buildShapeGeometry(kind);
    expect(triangleCount(g)).toBeLessThanOrEqual(SHAPE_TRIANGLE_BUDGET);
    g.computeBoundingBox();
    expect(g.boundingBox!.min.y).toBeCloseTo(0, 6);
    expect(g.boundingBox!.max.y).toBeCloseTo(1, 6);
  });

  it.each(GLYPH_KINDS)('%s glyph and the unit arc are small', (kind) => {
    expect(triangleCount(buildGlyphGeometry(kind))).toBeLessThanOrEqual(SHAPE_TRIANGLE_BUDGET);
    expect(triangleCount(buildUnitArcGeometry())).toBeLessThanOrEqual(SHAPE_TRIANGLE_BUDGET);
  });
});

describe('palette gradient', () => {
  it('goes violet → magenta → cyan', () => {
    const p = DEFAULT_TEMPLATE.palette;
    expect(gradientColor(p, 0).getHexString()).toBe('b04cff');
    expect(gradientColor(p, 0.5).getHexString()).toBe('ff4fd8');
    expect(gradientColor(p, 1).getHexString()).toBe('22d3ee');
  });
});

describe('terrain field (04-default-template requirement 2)', () => {
  const field = buildTerrainField(DEFAULT_TEMPLATE, 3);

  it('is deterministic for a seed, flat in the open plate and at the rim, mountains near the edges', () => {
    expect(buildTerrainField(DEFAULT_TEMPLATE, 3)).toEqual(field);
    expect(buildTerrainField(DEFAULT_TEMPLATE, 4)).not.toEqual(field);
    expect(field.peaks.length).toBeGreaterThan(5);
    expect(fieldHeight(field, 0, 0)).toBe(0);
    for (const t of [-6, -3, 0, 3, 6]) {
      expect(fieldHeight(field, t, 6)).toBe(0);
      expect(fieldHeight(field, -6, t)).toBe(0);
    }
    const peak = field.peaks[0]!;
    expect(fieldHeight(field, peak.x, peak.z)).toBeGreaterThan(0);
  });

  it('keeps mountains out of the city zones', () => {
    const half = (DEFAULT_TEMPLATE.terrain.size / 2) * 0.95;
    const city = DEFAULT_TEMPLATE.zones.filter((z) => z.kind === 'building' || z.kind === 'spike');
    for (const p of field.peaks) {
      const inside = city.some(
        (z) => p.x > z.xMin * half && p.x < z.xMax * half && p.z > z.zMin * half && p.z < z.zMax * half,
      );
      expect(inside).toBe(false);
    }
  });

  it('builds a deterministic crack network inside the plate, off the mountains', () => {
    const cracks = crackNetwork(field, 3);
    expect(cracks).toEqual(crackNetwork(field, 3));
    expect(cracks).not.toEqual(crackNetwork(field, 4));
    expect(cracks.length).toBeGreaterThan(1000);
    for (let i = 0; i < cracks.length; i += 3) {
      expect(Math.abs(cracks[i]!)).toBeLessThanOrEqual(6);
      expect(Math.abs(cracks[i + 2]!)).toBeLessThanOrEqual(6);
    }
  });
});

describe('TerrainView (task 4.1)', () => {
  it('pulses the cracks on kicks', () => {
    const view = new TerrainView(plan);
    view.update(worldStateAt(plan, plan.kicks[3]!));
    const onKick = view.crackIntensity();
    view.update(worldStateAt(plan, plan.kicks[3]! + 0.4));
    expect(onKick).toBeGreaterThan(view.crackIntensity() + 1);
    view.dispose();
  });
});

describe('StaffView (task 4.2)', () => {
  it('shows one glyph per note on the staff or falling', () => {
    const view = new StaffView(plan);
    for (const t of [0, 1.5, 6, 12.3, 23.9]) {
      const state = worldStateAt(plan, t);
      view.update(state);
      expect(view.visibleGlyphs()).toBe(state.notesOnStaff.length + state.fallingNotes.length);
    }
    view.dispose();
  });
});

describe('StructureView (task 4.3)', () => {
  it('uses one InstancedMesh per kind and matches the state after any seek', () => {
    const view = new StructureView(plan);
    expect(view.drawCalls()).toBe(plan.tracks.length);
    const m = new Matrix4();
    const scale = new Vector3();
    for (const t of [20, 3, 24, 0.5, 11]) {
      const state = worldStateAt(plan, t);
      view.update(state);
      const live = new Set(state.structures.map((s) => `${s.kind}#${s.slot}`));
      for (const track of plan.tracks) {
        const mesh = view.mesh(track.kind) as InstancedMesh;
        for (let i = 0; i < mesh.count; i++) {
          mesh.getMatrixAt(i, m);
          scale.setFromMatrixScale(m);
          expect(scale.y > 0).toBe(live.has(`${track.kind}#${i}`));
        }
      }
    }
    view.dispose();
  });
});

describe('FxView (task 4.4)', () => {
  it('maps the unit arc between two targets', () => {
    const from = new Vector3(1, 0, 2);
    const to = new Vector3(4, 0, -2);
    const m = arcMatrix(from, to);
    expect(new Vector3(0, 0, 0).applyMatrix4(m).distanceTo(from)).toBeLessThan(1e-9);
    expect(new Vector3(1, 0, 0).applyMatrix4(m).distanceTo(to)).toBeLessThan(1e-9);
  });

  it('shows the chord arcs of the state and drifts particles with song time only', () => {
    const view = new FxView(plan);
    const state = worldStateAt(plan, plan.groups[0]!.landAt + 0.6);
    view.update(state);
    expect(view.visibleArcs()).toBe(state.arcs.length);
    expect(state.arcs.length).toBeGreaterThan(0);
    const particles = view.object.children.at(-1)!;
    expect(particles.rotation.y).toBeCloseTo(state.t * PARTICLE_SPIN, 12);
    view.update(worldStateAt(plan, 23));
    view.update(state); // seek back: same pose as the first visit
    expect(particles.rotation.y).toBeCloseTo(state.t * PARTICLE_SPIN, 12);
    view.dispose();
  });
});

describe('draw call budget (requirement 5.1)', () => {
  it('the whole default world stays well under 100 draw calls', () => {
    const views = [new TerrainView(plan), new StaffView(plan), new StructureView(plan), new FxView(plan)];
    const total = views.reduce((n, v) => n + drawCalls(v.object), 0);
    expect(total).toBeLessThan(40);
    views.forEach((v) => v.dispose());
  });
});

describe('city (04-default-template requirement 5)', () => {
  it('injects the window shader into the building material without dropping three.js chunks', () => {
    const material = buildingMaterial();
    const shader = {
      vertexShader: 'void main() {\n#include <begin_vertex>\n#include <project_vertex>\n}',
      fragmentShader: 'void main() {\n#include <color_fragment>\n#include <opaque_fragment>\n}',
    };
    material.onBeforeCompile(shader as never, undefined as never);
    expect(shader.vertexShader).toContain('#include <begin_vertex>');
    expect(shader.vertexShader).toContain('vMwLocal = position * mwScale');
    expect(shader.fragmentShader).toContain('#include <color_fragment>');
    expect(shader.fragmentShader).toContain('#include <opaque_fragment>');
    expect(shader.fragmentShader).toContain('mwHash');
  });

  it('builds equalizer spikes as additive needle clusters that fade toward the tips', () => {
    const g = buildShapeGeometry('spike');
    const colors = g.getAttribute('color');
    const pos = g.getAttribute('position');
    let base = 0;
    let tip = 1;
    for (let i = 0; i < pos.count; i++) {
      if (pos.getY(i) < 1e-6) base = Math.max(base, colors.getX(i));
      if (pos.getY(i) > 0.999) tip = Math.min(tip, colors.getX(i));
    }
    expect(base).toBeCloseTo(1, 6);
    expect(tip).toBeLessThan(0.3);
    expect(spikeMaterial().blending).toBe(AdditiveBlending);
  });
});

describe('fx (04-default-template requirement 6)', () => {
  it('lays the decor arcs around the staff, inside the plate, deterministically', () => {
    const a = decorArcs(plan, mulberry32(9));
    const b = decorArcs(plan, mulberry32(9));
    expect(a.points.map((p) => p.toArray())).toEqual(b.points.map((p) => p.toArray()));
    expect(a.tubes).toHaveLength(DECOR_ARC_COUNT);
    const half = DEFAULT_TEMPLATE.terrain.size / 2;
    for (const p of a.points) {
      expect(Math.abs(p.x)).toBeLessThan(half * 1.05);
      expect(Math.abs(p.z)).toBeLessThan(half * 1.05);
      expect(p.y).toBeLessThan(1);
    }
  });

  it('keeps chord arcs low', () => {
    const m = arcMatrix(new Vector3(-5, 0, 0), new Vector3(5, 0, 0));
    expect(new Vector3(0.5, 1, 0).applyMatrix4(m).y).toBeLessThanOrEqual(ARC_HEIGHT_MAX + 1e-9);
  });
});

describe('paused steady state (07-xr-mode requirement 6.2)', () => {
  it('re-uploads no instance buffer while t does not change, and resumes on the next t', () => {
    const staff = new StaffView(plan);
    const fx = new FxView(plan);
    const structures = new StructureView(plan);
    const buffers = () => {
      const versions: number[] = [];
      for (const view of [staff, fx, structures]) {
        view.object.traverse((o) => {
          const mesh = o as InstancedMesh;
          if (mesh.isInstancedMesh) versions.push(mesh.instanceMatrix.version);
        });
      }
      return versions;
    };
    const paused = worldStateAt(plan, 20);
    for (const view of [staff, fx, structures]) view.update(paused);
    const before = buffers();
    for (const view of [staff, fx, structures]) view.update(worldStateAt(plan, 20));
    expect(buffers()).toEqual(before);
    for (const view of [staff, fx, structures]) view.update(worldStateAt(plan, 20.5));
    expect(buffers().some((v, i) => v !== before[i])).toBe(true);
    for (const view of [staff, fx, structures]) view.dispose();
  });
});
