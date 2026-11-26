import fc from 'fast-check';
import { describe, expect, it } from 'vitest';
import { NEON_NOCTURNE } from '@/templates/default';
import { TemplateSchema } from '@/templates/generated';
import * as m from './map-model';

const empty = () => m.createMap({ name: 'My Café', from: null, environment: 'city', plateSize: 12, seed: 42 });

describe('createMap', () => {
  it('makes a valid empty plate for every environment', () => {
    for (const environment of ['city', 'meadow', 'underwater'] as const) {
      const t = m.createMap({ name: 'x', from: null, environment, plateSize: 20, seed: 1 });
      expect(() => TemplateSchema.parse(t)).not.toThrow();
      expect(m.placedOf(t)).toHaveLength(0);
      expect(t.terrain.size).toBe(20);
      expect(t.fx.environment).toBe(environment === 'underwater' ? 'underwater' : 'land');
    }
  });

  it('names, slugs and seeds the map; clamps the plate and the seed', () => {
    const t = m.createMap({ name: '  My Café  ', from: null, environment: 'city', plateSize: 999, seed: -5 });
    expect(t.name).toBe('My Café');
    expect(t.id).toBe('my-cafe-0');
    expect(t.terrain.size).toBe(m.PLATE_RANGE.max);
    expect(t.layout?.seed).toBe(0);
  });

  it('copies a stock template without sharing it and clears its placed objects', () => {
    const before = JSON.stringify(NEON_NOCTURNE);
    const t = m.createMap({ name: 'Copy', from: NEON_NOCTURNE, environment: 'city', plateSize: 12, seed: 3 });
    expect(t.mappings).toEqual(NEON_NOCTURNE.mappings);
    expect(t.layout?.placed).toEqual([]);
    expect(JSON.stringify(NEON_NOCTURNE)).toBe(before);
  });

  it('falls back to an id and a name for an empty title', () => {
    const t = m.createMap({ name: '   ', from: null, environment: 'meadow', plateSize: 12, seed: 1 });
    expect(t.name).toBe('My map');
    expect(t.id).toBe('my-map-1');
  });
});

describe('placing and editing', () => {
  it('places with a fresh id, snapped to the grid, and stays valid', () => {
    const { template, id } = m.placeObject(empty(), 'tree', 2.4, -3.6, { snap: 1, yaw: 270, scale: 9 });
    const o = m.placedOf(template).find((p) => p.id === id)!;
    expect([o.x, o.z]).toEqual([2, -4]);
    expect(o.yaw).toBe(-90);
    expect(o.scale).toBe(5);
    expect(() => TemplateSchema.parse(template)).not.toThrow();
  });

  it('refuses an unknown recipe and a full map', () => {
    expect(m.placeObject(empty(), 'recipe:ghost', 0, 0).id).toBeNull();
    let t = empty();
    for (let i = 0; i < m.MAX_PLACED + 3; i += 1) t = m.placeObject(t, 'bush', i % 10, 0).template;
    expect(m.placedOf(t)).toHaveLength(m.MAX_PLACED);
    expect(m.placeObject(t, 'bush', 0, 0).id).toBeNull();
  });

  it('moves, updates, removes and replaces', () => {
    const first = m.placeObject(empty(), 'tree', 0, 0);
    let { template } = first;
    const { id } = first;
    template = m.movePlaced(template, id!, 5.6, 7.2, 0.5);
    expect(m.placedOf(template)[0]).toMatchObject({ x: 5.5, z: 7 });
    template = m.updatePlaced(template, id!, { scale: 0.01, variant: 99 });
    expect(m.placedOf(template)[0]).toMatchObject({ scale: 0.2, variant: 15 });
    template = m.replaceKind(template, [id!], 'building', 2);
    expect(m.placedOf(template)[0]).toMatchObject({ kind: 'building', variant: 2 });
    expect(m.removePlaced(template, [id!])).toMatchObject({ layout: { placed: [] } });
    expect(m.removePlaced(template, ['nope'])).toBe(template);
  });

  it('copies and arrays with unique ids', () => {
    const { template, id } = m.placeObject(empty(), 'tree', 0, 0);
    const copy = m.copyPlaced(template, [id!], 2, 0);
    expect(copy.ids).toHaveLength(1);
    const arr = m.arrayPlaced(copy.template, id!, 4, 0, 3);
    expect(arr.ids).toHaveLength(4);
    const ids = m.placedOf(arr.template).map((p) => p.id);
    expect(new Set(ids).size).toBe(ids.length);
    expect(m.placedOf(arr.template).at(-1)!.z).toBe(12);
    expect(() => TemplateSchema.parse(arr.template)).not.toThrow();
  });

  it('selects by box and by click', () => {
    let t = empty();
    t = m.placeObject(t, 'tree', 1, 1).template;
    t = m.placeObject(t, 'tree', 5, 5).template;
    expect(m.placedInBox(t, 6, 6, 0, 0)).toHaveLength(2);
    expect(m.placedInBox(t, 0, 0, 2, 2)).toHaveLength(1);
    expect(m.pickPlaced(t, 1.2, 0.9, 1)).toBe('o1');
    expect(m.pickPlaced(t, 20, 20, 1)).toBeNull();
  });

  it('keeps every object inside the schema bounds whatever the input', () => {
    fc.assert(
      fc.property(fc.double(), fc.double(), fc.double(), fc.double(), (x, z, yaw, scale) => {
        const { template } = m.placeObject(empty(), 'tree', x, z, { yaw, scale });
        expect(TemplateSchema.safeParse(template).success).toBe(true);
      }),
    );
  });

  it('never mutates its input', () => {
    const t = empty();
    const before = JSON.stringify(t);
    const { template, id } = m.placeObject(t, 'tree', 1, 1);
    m.copyPlaced(template, [id!], 1, 1); m.removePlaced(template, [id!]); m.movePlaced(template, id!, 3, 3);
    expect(JSON.stringify(t)).toBe(before);
  });
});

describe('helpers', () => {
  it('snaps and slugs', () => {
    expect(m.snapTo(2.6, 0)).toBe(2.6);
    expect(m.snapTo(2.6, 2)).toBe(2);
    expect(m.slugify('Été sur la Plage!')).toBe('ete-sur-la-plage');
  });
});
