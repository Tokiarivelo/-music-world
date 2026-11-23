import { describe, expect, it } from 'vitest';
import { Matrix4, Vector3, type InstancedMesh, type Object3D } from 'three';
import demo from '@/engine/__fixtures__/demo-analysis.json';
import { buildSpawnPlan } from '@/engine/spawn-plan';
import { worldStateAt } from '@/engine/world-state';
import { DEFAULT_TEMPLATE } from '@/templates/default';
import { PARTICLE_SPIN, SHAPE_TRIANGLE_BUDGET } from '../constants';
import { gradientColor } from '../palette';
import { buildShapeGeometry, triangleCount } from '../shapes/builtin-shapes';
import { arcMatrix, buildUnitArcGeometry, FxView } from './fx-view';
import { buildGlyphGeometry, GLYPH_KINDS, StaffView } from './staff-view';
import { StructureView } from './structure-view';
import { crackSegments, TerrainView } from './terrain-view';

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

describe('TerrainView (task 4.1)', () => {
  it('builds deterministic cracks inside the plate and pulses them on kicks', () => {
    expect(crackSegments(12, 3)).toEqual(crackSegments(12, 3));
    expect(crackSegments(12, 3)).not.toEqual(crackSegments(12, 4));
    expect([...crackSegments(12, 3)].every((v) => Math.abs(v) <= 6)).toBe(true);
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
