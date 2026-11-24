import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';
import { DEMO_ANALYSIS as demo } from '@/engine/__fixtures__/demo-analysis';
import { buildSpawnPlan } from '@/engine/spawn-plan';
import { worldStateAt } from '@/engine/world-state';
import { TemplateSchema } from '@/templates/generated';

// The northern-lights launch template is served by the store (featured); the web app validates it like any template.
const FILE = resolve(__dirname, '../../../../api/music_world/templates/infrastructure/featured/aurora-night.json');
const AURORA = TemplateSchema.parse(JSON.parse(readFileSync(FILE, 'utf8')));

describe('aurora-night store template', () => {
  it('validates (zod) and uses the aurora staff', () => {
    expect(AURORA.id).toBe('aurora-night');
    expect(AURORA.staff.style).toBe('aurora');
  });

  it('rains notes from the sky: the staff is high and each fall lasts over a second', () => {
    const plan = buildSpawnPlan(demo, AURORA, 1);
    expect(plan.staff.baseY).toBeGreaterThan(AURORA.terrain.size * 0.1);
    const first = plan.records[plan.sceneryCount]!;
    const falling = worldStateAt(plan, first.onset + 0.5).fallingNotes;
    expect(falling.length).toBeGreaterThan(0);
    expect(falling[0]!.progress).toBeLessThan(1);
  });
});
