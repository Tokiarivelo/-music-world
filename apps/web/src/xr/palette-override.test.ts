import { describe, expect, it } from 'vitest';
import { DEMO_ANALYSIS as demo } from '@/engine/__fixtures__/demo-analysis';
import { buildSpawnPlan } from '@/engine/spawn-plan';
import { worldStateAt } from '@/engine/world-state';
import { DEFAULT_TEMPLATE } from '@/templates/default';
import { applyPaletteOverride } from './palette-override';

const plan = buildSpawnPlan(demo, DEFAULT_TEMPLATE, 1);

describe('applyPaletteOverride', () => {
  it('returns the same plan for null, empty or unchanged overrides', () => {
    expect(applyPaletteOverride(plan, null)).toBe(plan);
    expect(applyPaletteOverride(plan, {})).toBe(plan);
    expect(applyPaletteOverride(plan, { primary: plan.template.palette.primary })).toBe(plan);
  });

  it('merges roles without mutating the template and keeps the world state', () => {
    const before = JSON.stringify(plan.template.palette);
    const next = applyPaletteOverride(plan, { background: '#336699' });
    expect(next).not.toBe(plan);
    expect(next.template.palette.background).toBe('#336699');
    expect(next.template.palette.primary).toBe(plan.template.palette.primary);
    expect(JSON.stringify(plan.template.palette)).toBe(before);
    expect(worldStateAt(next, 12.5)).toEqual({ ...worldStateAt(plan, 12.5) });
  });
});
