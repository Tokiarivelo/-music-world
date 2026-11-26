import { describe, expect, it } from 'vitest';
import { DEMO_ANALYSIS as demo } from '@/engine/__fixtures__/demo-analysis';
import { buildSpawnPlan } from '@/engine/spawn-plan';
import { worldStateAt } from '@/engine/world-state';
import { DEFAULT_TEMPLATE } from '@/templates/default';
import { StructureView } from './structure-view';

describe('objects touched by a falling note blink in rainbow colours', () => {
  it('colours an object a falling note passes through, then calms down; a seek back forgets it', () => {
    const plan = buildSpawnPlan(demo, DEFAULT_TEMPLATE, 1);
    const view = new StructureView(plan);
    const touched = (view as unknown as { touched: Map<number, number> }).touched;
    const rainbowable = (i: number): boolean => plan.records[i]!.kind !== 'terrain_ridge'; // hills keep their own colour
    let at = -1;
    for (let t = 1; t < 120 && ![...touched.keys()].some(rainbowable); t += 0.05) {
      view.update(worldStateAt(plan, t));
      at = t;
    }
    expect(touched.size, 'a falling note touches an object somewhere in the demo').toBeGreaterThan(0);
    const index = [...touched.keys()].find(rainbowable)!;
    const colorOf = (t: number): number[] => {
      view.update(worldStateAt(plan, t));
      const s = worldStateAt(plan, t).structures.find((x) => x.index === index)!;
      return Array.from(view.meshFor(s.kind, s.slot, s.variant)!.instanceColor!.array.slice(s.slot * 3, s.slot * 3 + 3));
    };
    const during = colorOf(at + 0.01);
    const blink = colorOf(at + 0.12);
    const calm = colorOf(at + 30);
    expect(during).not.toEqual(calm); // rainbow while it lasts
    expect(blink).not.toEqual(during); // and it blinks and shifts hue
    view.update(worldStateAt(plan, 0.5)); // seek back: nothing is touched yet
    expect(touched.size).toBe(0);
    view.dispose();
  });
});
