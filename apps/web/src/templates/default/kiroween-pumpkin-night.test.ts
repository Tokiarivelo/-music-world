import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';
import { DEMO_ANALYSIS as demo } from '@/engine/__fixtures__/demo-analysis';
import { buildSpawnPlan } from '@/engine/spawn-plan';
import { TemplateSchema } from '@/templates/generated';

// The Halloween launch template is served by the store (featured); the web app validates it like any store template.
const FILE = resolve(__dirname, '../../../../api/music_world/templates/infrastructure/featured/kiroween-pumpkin-night.json');
const KIROWEEN = TemplateSchema.parse(JSON.parse(readFileSync(FILE, 'utf8')));

describe('kiroween-pumpkin-night store template (06-template-store task 5)', () => {
  it('validates against music-world.template.v1 (zod)', () => {
    expect(KIROWEEN.id).toBe('kiroween-pumpkin-night');
    expect(KIROWEEN.license).toBe('CC-BY-4.0');
  });

  it('builds the demo world with pumpkins, tombstones, haunted houses and candles within budget', () => {
    const plan = buildSpawnPlan(demo, KIROWEEN, 1);
    const kinds = new Set(plan.records.map((r) => r.kind));
    expect(kinds.has('building')).toBe(true);
    expect(kinds.size).toBeGreaterThanOrEqual(3);
    for (const kind of kinds) {
      expect(plan.records.filter((r) => r.kind === kind).length).toBeLessThanOrEqual(KIROWEEN.budget.instancesPerKind);
    }
  });
});
