// Test helpers: build valid templates (defaults applied by the generated zod schema) and random notes.
import fc from 'fast-check';
import { TemplateSchema } from '@/templates/generated';
import type { NoteEvent, WorldTemplate } from '../types';

export const TEST_PALETTE = {
  background: '#07051a',
  terrain: '#1a1533',
  primary: '#b04cff',
  accent: '#ff4fd8',
  secondary: '#22d3ee',
  staff: '#e8f7ff',
} as const;

export function makeTemplate(overrides: Record<string, unknown> = {}): WorldTemplate {
  return TemplateSchema.parse({
    schema: 'music-world.template.v1',
    id: 'test-template',
    name: 'Test',
    license: 'MIT',
    palette: TEST_PALETTE,
    mappings: [{ when: {}, spawn: 'crystal' }],
    ...overrides,
  });
}

export const STEMS = ['vocals', 'drums', 'bass', 'other'] as const;

export function noteArb(id = 'n_0000'): fc.Arbitrary<NoteEvent> {
  return fc.record({
    id: fc.constant(id),
    time: fc.double({ min: 0, max: 600, noNaN: true }),
    duration: fc.double({ min: 0.01, max: 8, noNaN: true }),
    midi: fc.integer({ min: 0, max: 127 }),
    velocity: fc.double({ min: 0, max: 1, noNaN: true }),
    stem: fc.constantFrom(...STEMS),
    chordId: fc.option(fc.constant('c_0'), { nil: null }),
  });
}

const KINDS = ['terrain_ridge', 'building', 'spike', 'crystal', 'cluster', 'recipe:tower'] as const;
const unit = fc.double({ min: -1, max: 1, noNaN: true });

/** Random valid templates: pitch-split mappings, zones, small budgets (to exercise slot reuse). */
export function templateArb(): fc.Arbitrary<WorldTemplate> {
  const rule = fc.record({
    when: fc.record(
      {
        pitch: fc.integer({ min: 0, max: 127 }).map((k) => `<${k}`),
        chord: fc.boolean(),
        stem: fc.constantFrom(...STEMS),
      },
      { requiredKeys: [] },
    ),
    spawn: fc.constantFrom(...KINDS),
    heightFrom: fc.constantFrom('velocity', 'duration', 'pitch'),
  });
  const zone = fc
    .record({ kind: fc.constantFrom(...KINDS), a: unit, b: unit, c: unit, d: unit })
    .filter(({ a, b, c, d }) => Math.abs(a - b) > 1e-3 && Math.abs(c - d) > 1e-3)
    .map(({ kind, a, b, c, d }) => ({
      kind,
      xMin: Math.min(a, b),
      xMax: Math.max(a, b),
      zMin: Math.min(c, d),
      zMax: Math.max(c, d),
    }));
  return fc
    .record({
      mappings: fc.array(rule, { minLength: 1, maxLength: 5 }),
      zones: fc.array(zone, { maxLength: 6 }),
      size: fc.double({ min: 4, max: 40, noNaN: true }),
      budget: fc.integer({ min: 1, max: 60 }),
      lookahead: fc.double({ min: 1, max: 8, noNaN: true }),
      fallDuration: fc.double({ min: 0.1, max: 2, noNaN: true }),
    })
    .map(({ mappings, zones, size, budget, lookahead, fallDuration }) =>
      makeTemplate({
        mappings,
        zones,
        terrain: { size },
        budget: { instancesPerKind: budget },
        staff: { lookahead, fallDuration },
      }),
    );
}
