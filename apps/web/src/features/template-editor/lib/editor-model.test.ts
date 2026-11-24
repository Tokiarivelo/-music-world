import fc from 'fast-check';
import { describe, expect, it } from 'vitest';
import { NEON_NOCTURNE } from '@/templates/default';
import type { Template } from '@/templates/generated';
import { MAX_RULES, MAX_ZONES, NUMBER_BOUNDS } from '../consts/template-editor.consts';
import * as model from './editor-model';
import { firstError, pathFromLoc, validateTemplate } from './editor-validate';

type Op = (t: Template) => Template;

const hex = fc.integer({ min: 0, max: 0xffffff }).map((n) => `#${n.toString(16).padStart(6, '0')}`);
const index = fc.integer({ min: -2, max: 40 });
const anyNumber = fc.oneof(fc.double({ noNaN: false }), fc.integer({ min: -100, max: 100 }));
const numericFields = ['terrain.size', 'staff.glow', 'staff.lookahead', 'staff.fallDuration', 'fx.bloom'] as const;

const operation: fc.Arbitrary<Op> = fc.oneof(
  fc.string({ maxLength: 80 }).map((name): Op => (t) => model.setName(t, name)),
  fc.tuple(fc.constantFrom('background', 'terrain', 'primary', 'accent', 'secondary', 'staff'), hex).map(
    ([role, color]): Op =>
      (t) =>
        model.setPaletteColor(t, role, color),
  ),
  fc.tuple(fc.constantFrom(...numericFields), anyNumber).map(
    ([field, value]): Op =>
      (t) =>
        model.setNumber(t, field, value),
  ),
  fc.constant<Op>((t) => model.addRule(t)),
  index.map((i): Op => (t) => model.removeRule(t, i)),
  fc.tuple(index, index).map(([a, b]): Op => (t) => model.moveRule(t, a, b)),
  fc.constant<Op>((t) => model.addZone(t)),
  index.map((i): Op => (t) => model.removeZone(t, i)),
  fc.tuple(index, fc.constantFrom('xMin', 'xMax', 'zMin', 'zMax'), anyNumber).map(
    ([i, bound, value]): Op =>
      (t) =>
        model.setZoneBound(t, i, bound, value),
  ),
);

function deepFreeze<T>(value: T): T {
  if (value && typeof value === 'object') {
    Object.values(value).forEach(deepFreeze);
    Object.freeze(value);
  }
  return value;
}

describe('editor model', () => {
  it('is valid at the start and for its copy', () => {
    expect(validateTemplate(NEON_NOCTURNE)).toEqual([]);
    const copy = model.copyOf(NEON_NOCTURNE);
    expect(validateTemplate(copy)).toEqual([]);
    expect(copy.name).toBe('Neon Nocturne (copy)');
    expect(copy.id).toBe('neon-nocturne-copy');
    expect(NEON_NOCTURNE.name).toBe('Neon Nocturne');
  });

  it('any sequence of updates yields a valid template or at least one error, and never mutates its input', () => {
    fc.assert(
      fc.property(fc.array(operation, { maxLength: 25 }), (ops) => {
        let current = deepFreeze(structuredClone(NEON_NOCTURNE));
        for (const op of ops) current = deepFreeze(op(current)); // a mutation of a frozen input throws
        const errors = validateTemplate(current);
        const parsed = JSON.parse(JSON.stringify(current)) as Template;
        expect(current.mappings.length).toBeGreaterThanOrEqual(1);
        expect(current.mappings.length).toBeLessThanOrEqual(MAX_RULES);
        expect(current.zones.length).toBeLessThanOrEqual(MAX_ZONES);
        expect(errors.length === 0 || errors.every((e) => e.path !== undefined)).toBe(true);
        expect(validateTemplate(parsed)).toEqual(errors); // validation is deterministic
      }),
      { numRuns: 150 },
    );
  });

  it('clamps numbers to the schema bounds', () => {
    fc.assert(
      fc.property(fc.constantFrom(...numericFields), anyNumber, (field, value) => {
        const next = model.setNumber(NEON_NOCTURNE, field, value);
        const [section, key] = field.split('.') as ['terrain' | 'staff' | 'fx', string];
        const result = (next[section] as unknown as Record<string, number>)[key]!;
        expect(result).toBeGreaterThanOrEqual(NUMBER_BOUNDS[field].min);
        expect(result).toBeLessThanOrEqual(NUMBER_BOUNDS[field].max);
      }),
    );
  });

  it('keeps 1–32 rules and moves rules in order', () => {
    let t = NEON_NOCTURNE;
    for (let i = 0; i < 40; i++) t = model.addRule(t);
    expect(t.mappings).toHaveLength(MAX_RULES);
    const one = { ...t, mappings: t.mappings.slice(0, 1) };
    expect(model.removeRule(one, 0).mappings).toHaveLength(1);
    const two = model.addRule(one, { ...model.newRule(), spawn: 'spike' });
    expect(model.moveRule(two, 1, 0).mappings.map((r) => r.spawn)).toEqual(['spike', one.mappings[0]!.spawn]);
  });

  it('reports each kind of error with its path', () => {
    const lowContrast = model.setPaletteColor(NEON_NOCTURNE, 'staff', NEON_NOCTURNE.palette.background);
    expect(firstError(validateTemplate(lowContrast), 'palette.staff')?.code).toBe('contrast');
    const badName = { ...NEON_NOCTURNE, name: 'see https://x.y' };
    expect(firstError(validateTemplate(badName), 'name')?.code).toBe('name');
    const noRecipe = model.updateRule(NEON_NOCTURNE, 0, (r) => ({ ...r, spawn: 'recipe:ghost' }));
    expect(firstError(validateTemplate(noRecipe), 'mappings.0.spawn')?.code).toBe('kind');
    const inverted = model.setZoneBound(model.addZone(NEON_NOCTURNE), NEON_NOCTURNE.zones.length, 'xMin', 1);
    expect(firstError(validateTemplate(inverted), `zones.${NEON_NOCTURNE.zones.length}.xMax`)?.code).toBe('zoneOrder');
    const badColor = model.setPaletteColor(NEON_NOCTURNE, 'accent', 'red');
    expect(firstError(validateTemplate(badColor), 'palette.accent')?.code).toBe('schema');
    expect(validateTemplate({})).not.toEqual([]);
  });

  it('maps a server loc to a field path', () => {
    expect(pathFromLoc(['template', 'palette', 'staff'])).toBe('palette.staff');
    expect(pathFromLoc(['template', 'mappings', 2, 'spawn'])).toBe('mappings.2.spawn');
    expect(pathFromLoc(['template'])).toBe('');
  });
});
