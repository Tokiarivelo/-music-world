import { describe, expect, it } from 'vitest';
import { DEMO_ANALYSIS as demo } from '@/engine/__fixtures__/demo-analysis';
import { buildSpawnPlan } from '@/engine/spawn-plan';
import { TemplateSchema } from '@/templates/generated';
import { DEFAULT_TEMPLATE } from '.';
import json from './neon-nocturne.json';

describe('neon-nocturne default template (task 3, req 4.1)', () => {
  it('validates against music-world.template.v1 (zod, generated from pydantic)', () => {
    expect(TemplateSchema.safeParse(json).success).toBe(true);
    expect(TemplateSchema.parse(TemplateSchema.parse(json))).toEqual(TemplateSchema.parse(json));
  });

  it('uses the default palette of the reference image', () => {
    expect(DEFAULT_TEMPLATE.palette).toEqual({
      background: '#07051a',
      terrain: '#1a1533',
      primary: '#b04cff',
      accent: '#ff4fd8',
      secondary: '#22d3ee',
      staff: '#e8f7ff',
    });
  });

  it('puts the city (buildings and spikes) on the left half and the ridges on the edges', () => {
    for (const z of DEFAULT_TEMPLATE.zones) {
      if (z.kind === 'building' || z.kind === 'spike') expect(z.xMin).toBeLessThan(-0.25);
      if (z.kind === 'terrain_ridge') expect(Math.max(z.xMax, z.zMax)).toBeGreaterThan(0.9);
    }
  });

  it('builds the demo world with buildings, spikes and ridges', () => {
    const kinds = new Set(buildSpawnPlan(demo, DEFAULT_TEMPLATE, 1).records.map((r) => r.kind));
    // the notes of a city are placed by its plan: buildings, trees and bushes, cars; needles and hills keep their rule
    for (const kind of ['building', 'spike', 'terrain_ridge']) expect(kinds.has(kind as never)).toBe(true);
  });
});
