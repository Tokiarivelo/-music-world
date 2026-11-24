import { describe, expect, it } from 'vitest';
import type { Mesh, Object3D } from 'three';
import { DEMO_ANALYSIS as demo } from '@/engine/__fixtures__/demo-analysis';
import { buildSpawnPlan } from '@/engine/spawn-plan';
import { worldStateAt } from '@/engine/world-state';
import { DEFAULT_TEMPLATE } from '@/templates/default';
import { CURTAIN_TRIANGLES, buildCurtainGeometry, createAuroraCurtain } from './aurora-curtain';
import { StaffView } from './staff-view';

const aurora = { ...DEFAULT_TEMPLATE, staff: { ...DEFAULT_TEMPLATE.staff, style: 'aurora' as const, lookahead: 5, fallDuration: 1.4 } };
const classicPlan = buildSpawnPlan(demo, DEFAULT_TEMPLATE, 1);
const auroraPlan = buildSpawnPlan(demo, aurora, 1);

function meshes(root: Object3D): number {
  let n = 0;
  root.traverse((o) => {
    if ((o as Mesh).isMesh) n++;
  });
  return n;
}

describe('aurora curtain (I6)', () => {
  it('is one strip within the triangle budget, hanging along the staff', () => {
    const geometry = buildCurtainGeometry(auroraPlan.staff, 3);
    expect(geometry.index!.count / 3).toBe(CURTAIN_TRIANGLES);
    expect(CURTAIN_TRIANGLES).toBeLessThan(2000);
    const p = geometry.getAttribute('position');
    for (let i = 0; i < p.count; i += 1) expect(Number.isFinite(p.getX(i) + p.getY(i) + p.getZ(i))).toBe(true);
    expect(geometry.getAttribute('aGrid').count).toBe(p.count);
  });

  it('adds exactly one draw call to the staff view, and only for the aurora style', () => {
    const classic = new StaffView(classicPlan);
    const sky = new StaffView(auroraPlan);
    expect(meshes(sky.object)).toBe(meshes(classic.object) + 1);
    expect(sky.object.getObjectByName('aurora-curtain')).toBeTruthy();
    expect(classic.object.getObjectByName('aurora-curtain')).toBeUndefined();
    classic.dispose();
    sky.dispose();
  });

  it('follows the song time, and is still with reduced motion', () => {
    const palette = auroraPlan.template.palette;
    const live = createAuroraCurtain(auroraPlan.staff, palette, 12, 1, false);
    const still = createAuroraCurtain(auroraPlan.staff, palette, 12, 1, true);
    live.update(7);
    still.update(7);
    expect(live.mesh.material.uniforms.uTime!.value).toBe(7);
    expect(still.mesh.material.uniforms.uTime!.value).toBe(0);
    expect(still.mesh.material.uniforms.uAmplitude!.value).toBe(0);
    live.dispose();
    still.dispose();
  });

  it('keeps the aurora view feeding the same glyph counts as the classic one (seek equivalence)', () => {
    const view = new StaffView(auroraPlan);
    view.update(worldStateAt(auroraPlan, 12));
    const a = view.visibleGlyphs();
    view.update(worldStateAt(auroraPlan, 30));
    view.update(worldStateAt(auroraPlan, 12));
    expect(view.visibleGlyphs()).toBe(a);
    view.dispose();
  });
});
