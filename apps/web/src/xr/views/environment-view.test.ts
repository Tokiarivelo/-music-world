import { describe, expect, it } from 'vitest';
import type { BufferGeometry, Mesh, MeshBasicMaterial, Object3D, ShaderMaterial } from 'three';
import { DEMO_ANALYSIS as demo } from '@/engine/__fixtures__/demo-analysis';
import { buildSpawnPlan } from '@/engine/spawn-plan';
import { worldStateAt } from '@/engine/world-state';
import { DEFAULT_TEMPLATE } from '@/templates/default';
import { environmentColors } from '../palette';
import { ENVIRONMENT_DRAW_CALLS, EnvironmentView } from './environment-view';

const plan = buildSpawnPlan(demo, DEFAULT_TEMPLATE, 1);
const DRAW_CALL_BUDGET = 6;
const TRIANGLE_BUDGET = 5000;

function meshes(root: Object3D): Array<Mesh<BufferGeometry, MeshBasicMaterial | ShaderMaterial>> {
  const found: Array<Mesh<BufferGeometry, MeshBasicMaterial | ShaderMaterial>> = [];
  root.traverse((o) => {
    if ((o as Mesh).isMesh) found.push(o as Mesh<BufferGeometry, MeshBasicMaterial | ShaderMaterial>);
  });
  return found;
}

function triangles(geometry: BufferGeometry): number {
  return (geometry.index?.count ?? geometry.getAttribute('position').count) / 3;
}

describe('EnvironmentView (I2 requirement 5)', () => {
  const view = new EnvironmentView(plan);

  it('stays within the draw-call and triangle budgets with no texture', () => {
    const all = meshes(view.object);
    expect(all).toHaveLength(ENVIRONMENT_DRAW_CALLS);
    expect(all.length).toBeLessThanOrEqual(DRAW_CALL_BUDGET);
    expect(all.reduce((n, m) => n + triangles(m.geometry), 0)).toBeLessThanOrEqual(TRIANGLE_BUDGET);
    for (const m of all) expect((m.material as MeshBasicMaterial).map ?? null).toBeNull();
  });

  it('is deterministic for a seed and differs between seeds', () => {
    const crest = (v: EnvironmentView): number[] => {
      const hills = meshes(v.object)[2]!;
      return Array.from(hills.geometry.getAttribute('position').array);
    };
    expect(crest(new EnvironmentView(plan))).toEqual(crest(view));
    expect(crest(new EnvironmentView(buildSpawnPlan(demo, DEFAULT_TEMPLATE, 2)))).not.toEqual(crest(view));
  });

  it('is static: update() changes nothing and never touches the world state', () => {
    const before = JSON.stringify(worldStateAt(plan, 3));
    const positions = Array.from(meshes(view.object)[2]!.geometry.getAttribute('position').array);
    view.update();
    expect(Array.from(meshes(view.object)[2]!.geometry.getAttribute('position').array)).toEqual(positions);
    expect(JSON.stringify(worldStateAt(plan, 3))).toBe(before);
  });

  it('fog has the horizon color so land melts into the sky', () => {
    expect(view.fog.color.getHex()).toBe(environmentColors(DEFAULT_TEMPLATE.palette).horizon.getHex());
  });
});

describe('environmentColors', () => {
  it('derives every color from the palette and keeps the sky off the pure background color', () => {
    const c = environmentColors(DEFAULT_TEMPLATE.palette);
    const bg = environmentColors({ ...DEFAULT_TEMPLATE.palette, background: '#07051a' }).zenith;
    expect(c.zenith.getHex()).toBe(bg.getHex());
    expect(c.zenith.getHex()).not.toBe(0x07051a);
    expect(c.horizon.getHex()).not.toBe(c.zenith.getHex());
    const other = environmentColors({ ...DEFAULT_TEMPLATE.palette, primary: '#22d3ee' });
    expect(other.horizon.getHex()).not.toBe(c.horizon.getHex());
  });
});

describe('EnvironmentView underwater (Nemo Reef)', () => {
  const water = new EnvironmentView(
    buildSpawnPlan(demo, { ...DEFAULT_TEMPLATE, fx: { ...DEFAULT_TEMPLATE.fx, environment: 'underwater' } }, 1),
  );

  it('adds rising bubbles within the draw-call budget, hides the mist and keeps the air look unchanged', () => {
    expect(water.object.children.length).toBe(ENVIRONMENT_DRAW_CALLS + 1);
    expect(water.object.children.length).toBeLessThanOrEqual(DRAW_CALL_BUDGET);
    expect(() => water.update(worldStateAt(plan, 5))).not.toThrow();
    expect(new EnvironmentView(plan).object.children.length).toBe(ENVIRONMENT_DRAW_CALLS);
  });
});
