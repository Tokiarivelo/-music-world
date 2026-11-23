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
    mappings: [{ when: {}, spawn: 'building' }],
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
