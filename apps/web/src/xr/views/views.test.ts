import { describe, expect, it } from 'vitest';
import { AdditiveBlending, Matrix4, Vector3, type InstancedMesh, type MeshBasicMaterial, type MeshStandardMaterial, type Object3D } from 'three';
import { mulberry32 } from '@/engine/prng';
import { DEMO_ANALYSIS as demo } from '@/engine/__fixtures__/demo-analysis';
import { buildSpawnPlan } from '@/engine/spawn-plan';
import { isCityKind, templateHasCity, worldSize } from '@/engine/city';
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
      expect(Math.abs(cracks[i]!)).toBeLessThanOrEqual(worldSize(DEFAULT_TEMPLATE) / 2);
      expect(Math.abs(cracks[i + 2]!)).toBeLessThanOrEqual(worldSize(DEFAULT_TEMPLATE) / 2);
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

describe('recipe kinds (05-ai-world-director task 6.3)', () => {
  const tower = {
    name: 'tower',
    parts: [{ op: 'stack', of: 'box', levels: 4, height: 0.9 }],
    budget: { maxTriangles: 100 },
  } as unknown as NonNullable<typeof DEFAULT_TEMPLATE.recipes>[number];
  const withRecipe = (recipes: (typeof tower)[]) => ({
    ...DEFAULT_TEMPLATE,
    mappings: [{ ...DEFAULT_TEMPLATE.mappings[0]!, spawn: 'recipe:tower' }],
    zones: [],
    recipes,
  });

  it('renders a recipe kind with the geometry built from the template recipes', () => {
    const view = new StructureView(buildSpawnPlan(demo, withRecipe([tower]), 1));
    const mesh = view.object.children.find((c) => c.name === 'structures:recipe:tower') as InstancedMesh;
    expect(triangleCount(mesh.geometry)).toBe(48);
  });

  it('falls back to a box when the recipe is missing or over its budget', () => {
    expect(triangleCount(buildShapeGeometry('recipe:tower'))).toBe(12);
    const tight = { ...tower, budget: { maxTriangles: 20 } };
    expect(triangleCount(buildShapeGeometry('recipe:tower', [tight]))).toBe(12);
  });
});

/** City ground, water, poles and lamps (4), the four extra building variants (4), scaffolding and cranes (2). */
const CITY_DRAW_CALLS = 11; // plus the road mesh of the boulevards

describe('StructureView (task 4.3)', () => {
  it('uses one InstancedMesh per kind and matches the state after any seek', () => {
    const view = new StructureView(plan);
    // one per kind, plus (city) ground, water, poles and lamps, the 4 extra building variants, scaffolding and cranes,
    // the road mesh and one shared blob-shadow mesh when trees or cars exist
    const extra = templateHasCity(plan.template) ? CITY_DRAW_CALLS + (plan.tracks.some((t) => ['tree', 'conifer', 'bush', 'car'].includes(t.kind)) ? 1 : 0) : 0;
    expect(view.drawCalls()).toBe(plan.tracks.length + extra);
    const m = new Matrix4();
    const scale = new Vector3();
    for (const t of [20, 3, 24, 0.5, 11]) {
      const state = worldStateAt(plan, t);
      view.update(state);
      const live = new Set(state.structures.map((s) => `${s.kind}#${s.slot}`));
      for (const track of plan.tracks) {
        const meshes = view.meshesOf(track.kind);
        for (let i = 0; i < meshes[0]!.count; i++) {
          const drawn = meshes.some((mesh) => {
            mesh.getMatrixAt(i, m);
            scale.setFromMatrixScale(m);
            return scale.y > 0;
          });
          // A city note also builds the spots around it: those are drawn without being a live structure.
          if (templateHasCity(plan.template) && isCityKind(track.kind)) {
            if (live.has(`${track.kind}#${i}`)) expect(drawn).toBe(true);
          } else expect(drawn).toBe(live.has(`${track.kind}#${i}`));
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

describe('object kinds: contact shadows and wind (I8)', () => {
  const objects = {
    ...DEFAULT_TEMPLATE,
    mappings: [
      { when: { pitch: '<60' }, spawn: 'tree', heightFrom: 'duration' },
      { when: { pitch: '<72' }, spawn: 'car', heightFrom: 'velocity' },
      { when: {}, spawn: 'cloud', heightFrom: 'pitch' },
    ],
    zones: [
      { kind: 'tree', xMin: -0.9, xMax: 0.9, zMin: -0.9, zMax: 0 },
      { kind: 'car', xMin: -0.9, xMax: 0.9, zMin: 0, zMax: 0.9 },
      { kind: 'cloud', xMin: -0.9, xMax: 0.9, zMin: -0.9, zMax: 0.9 },
    ],
    scenery: [{ kind: 'bush', count: 6 }],
  } as unknown as typeof DEFAULT_TEMPLATE;
  const objPlan = buildSpawnPlan(demo, objects, 1);

  it('adds one shadow draw call and keeps the world under budget', () => {
    const view = new StructureView(objPlan);
    expect(view.drawCalls()).toBe(objPlan.tracks.length + 2); // one per kind, the shadows and the roads (the plan has cars)
    expect(drawCalls(view.object)).toBe(view.drawCalls());
    view.dispose();
  });

  it('puts a shadow under every shown object, flat on the plate, and replays the same after a seek', () => {
    const view = new StructureView(objPlan);
    const shadows = view.object.getObjectByName('structures:shadows') as InstancedMesh;
    const state = worldStateAt(objPlan, 20);
    view.update(state);
    const shown = state.structures.length;
    expect(shadows.count).toBeLessThanOrEqual(shown); // cars, planes and clouds beyond their cap have left
    expect(shadows.count).toBeGreaterThan(0);
    const m = new Matrix4();
    shadows.getMatrixAt(0, m);
    expect(m.elements[13]).toBeLessThan(0.01);
    const first = Array.from(shadows.instanceMatrix.array.slice(0, shadows.count * 16));
    view.update(worldStateAt(objPlan, 5));
    view.update(worldStateAt(objPlan, 20));
    expect(Array.from(shadows.instanceMatrix.array.slice(0, shadows.count * 16))).toEqual(first);
    view.dispose();
  });

  it('sways foliage from the audio clock only', () => {
    const view = new StructureView(objPlan);
    const mesh = view.mesh('tree')!;
    const time = (mesh.material as MeshBasicMaterial).userData.mwTime as { value: number };
    view.update(worldStateAt(objPlan, 12.5));
    expect(time.value).toBe(12.5);
    view.update(worldStateAt(objPlan, 3));
    expect(time.value).toBe(3);
    view.dispose();
  });
});

describe('polished materials (I19)', () => {
  const base = {
    ...DEFAULT_TEMPLATE,
    mappings: [
      { when: { pitch: '<60' }, spawn: 'tree', heightFrom: 'duration' },
      { when: { pitch: '<72' }, spawn: 'car', heightFrom: 'velocity' },
      { when: {}, spawn: 'building' },
    ],
    zones: [
      { kind: 'tree', xMin: -0.9, xMax: 0.9, zMin: -0.9, zMax: 0 },
      { kind: 'car', xMin: -0.9, xMax: 0.9, zMin: 0, zMax: 0.9 },
      { kind: 'building', xMin: -0.9, xMax: 0.9, zMin: -0.9, zMax: 0.9 },
    ],
  };
  const withMaterial = (material: 'flat' | 'polished') =>
    buildSpawnPlan(demo, { ...base, fx: { ...base.fx, material } } as unknown as typeof DEFAULT_TEMPLATE, 1);

  it('lights objects and keeps the city and spikes unlit when the template is polished', () => {
    const view = new StructureView(withMaterial('polished'));
    const material = (k: string) => view.mesh(k as never)!.material as MeshStandardMaterial;
    expect(material('tree').isMeshStandardMaterial).toBe(true);
    expect(material('car').metalness).toBeGreaterThan(0.5);
    expect(material('car').roughness).toBeLessThan(0.4);
    expect(material('tree').roughness).toBeGreaterThan(0.6);
    expect(material('building').isMeshStandardMaterial).toBeFalsy();
    expect(view.mesh('car')!.geometry.hasAttribute('normal')).toBe(true);
    view.dispose();
  });

  it('keeps every material unlit when the template is flat', () => {
    const view = new StructureView(withMaterial('flat'));
    for (const k of ['tree', 'car', 'building']) {
      expect((view.mesh(k as never)!.material as MeshStandardMaterial).isMeshStandardMaterial).toBeFalsy();
    }
    view.dispose();
  });

  it('the default look stays flat (reference image)', () => {
    expect(DEFAULT_TEMPLATE.fx.material).toBe('flat');
  });
});
