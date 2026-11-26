import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { DEMO_ANALYSIS as demo } from '@/engine/__fixtures__/demo-analysis';
import { buildSpawnPlan } from '@/engine/spawn-plan';
import { worldStateAt } from '@/engine/world-state';
import { DEFAULT_TEMPLATE } from '@/templates/default';
import { TemplateSchema } from '@/templates/generated';
import { RealmGlowView } from './realm-glow-view';

const realm = TemplateSchema.parse(
  JSON.parse(readFileSync(resolve(__dirname, '../../../../api/music_world/templates/infrastructure/featured/enchanted-realm.json'), 'utf8')),
);

describe('realm glow (I41)', () => {
  it('adds fairy lights and mist to a realm, nothing to a city, and is a pure function of time', () => {
    const plan = buildSpawnPlan(demo, realm, 2);
    const view = new RealmGlowView(plan);
    expect(view.object.children).toHaveLength(2);
    const at = (t: number): number[] => {
      view.update(worldStateAt(plan, t));
      const lights = view.object.children[0] as unknown as { geometry: { getAttribute(n: string): { array: Float32Array } } };
      return Array.from(lights.geometry.getAttribute('position').array.slice(0, 6));
    };
    const a = at(10);
    at(40);
    expect(at(10)).toEqual(a);
    expect(at(11)).not.toEqual(a);
    view.dispose();
    expect(new RealmGlowView(buildSpawnPlan(demo, DEFAULT_TEMPLATE, 2)).object.children).toHaveLength(0);
  });
});
