import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';
import { DEMO_ANALYSIS as demo } from '@/engine/__fixtures__/demo-analysis';
import { buildSpawnPlan } from '@/engine/spawn-plan';
import { TemplateSchema } from '@/templates/generated';

// The ocean launch template is served by the store (featured); the web app validates it like any store template.
const FILE = resolve(__dirname, '../../../../api/music_world/templates/infrastructure/featured/nemo-reef.json');
const NEMO = TemplateSchema.parse(JSON.parse(readFileSync(FILE, 'utf8')));

describe('nemo-reef store template', () => {
  it('validates against music-world.template.v1 (zod)', () => {
    expect(NEMO.id).toBe('nemo-reef');
    expect(NEMO.license).toBe('CC-BY-4.0');
  });

  it('builds the demo world with several shape kinds within budget', () => {
    const plan = buildSpawnPlan(demo, NEMO, 1);
    const kinds = new Set(plan.records.map((r) => r.kind));
    expect(kinds.size).toBeGreaterThanOrEqual(3);
    for (const kind of kinds) {
      expect(plan.records.filter((r) => r.kind === kind).length).toBeLessThanOrEqual(NEMO.budget.instancesPerKind);
    }
  });
});
