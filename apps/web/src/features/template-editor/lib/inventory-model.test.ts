import { describe, expect, it } from 'vitest';
import { NEON_NOCTURNE } from '@/templates/default';
import type { Template } from '@/templates/generated';
import { templateObjects, totalUses } from './inventory-model';

const base = NEON_NOCTURNE as Template;

describe('templateObjects', () => {
  it('lists every kind once, with the usage counted', () => {
    const t = {
      ...base,
      mappings: [
        { ...base.mappings[0]!, spawn: 'tree' as const },
        { ...base.mappings[0]!, spawn: 'tree' as const },
      ],
      scenery: [{ kind: 'tree' as const, count: 5 }, { kind: 'bush' as const, count: 2 }],
      zones: [],
    } as Template;
    const objects = templateObjects(t);
    expect(objects.map((o) => o.kind).sort()).toEqual(['bush', 'tree']);
    const tree = objects.find((o) => o.kind === 'tree')!;
    expect(tree.usage).toEqual({ mappings: 2, scenery: 5, zones: 0 });
    expect(tree.role).toBe('flora');
    expect(tree.origin).toBe('builtin');
    expect(totalUses(tree)).toBe(7);
  });

  it('puts recipes first and keeps an unused recipe', () => {
    const recipe = { ...(base.recipes[0] ?? { schema: 'music-world.shape.v1', parts: [], nodes: [] }), name: 'lamp' } as Template['recipes'][number];
    const t = { ...base, recipes: [recipe], mappings: [{ ...base.mappings[0]!, spawn: 'bush' as const }], scenery: [], zones: [] } as Template;
    const objects = templateObjects(t);
    expect(objects[0]).toMatchObject({ kind: 'recipe:lamp', origin: 'recipe', recipeIndex: 0, name: 'lamp' });
    expect(objects[0]!.usage).toEqual({ mappings: 0, scenery: 0, zones: 0 });
    expect(objects.some((o) => o.kind === 'bush')).toBe(true);
  });

  it('is stable and pure', () => {
    const before = JSON.stringify(base);
    expect(templateObjects(base)).toEqual(templateObjects(base));
    expect(JSON.stringify(base)).toBe(before);
  });

  it('flags city kinds', () => {
    expect(templateObjects(base).find((o) => o.kind === 'building')?.cityKind).toBe('building');
  });
});
