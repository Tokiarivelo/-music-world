import { describe, expect, it } from 'vitest';
import { BUILDING_VARIANTS } from '@/engine/city';
import { buildingVariantGeometries, craneGeometry, scaffoldGeometry } from './house-shapes';
import { triangleCount } from './builtin-shapes';

describe('building variants (I39)', () => {
  const geometries = buildingVariantGeometries();

  it('has one geometry per variant, on a unit footprint, base at 0, height 1', () => {
    expect(geometries).toHaveLength(BUILDING_VARIANTS.length);
    for (const g of geometries) {
      g.computeBoundingBox();
      const box = g.boundingBox!;
      expect(box.min.y).toBeCloseTo(0, 6);
      expect(box.max.y).toBeCloseTo(1, 6);
      expect(box.max.x).toBeLessThanOrEqual(0.6);
      expect(box.max.z).toBeLessThanOrEqual(0.72);
    }
  });

  it('gives roofs an upward normal so the building material paints them', () => {
    const house = geometries[1]!;
    const normals = house.getAttribute('normal');
    let slanted = 0;
    for (let i = 0; i < normals.count; i += 1) if (normals.getY(i) > 0.5 && normals.getY(i) < 0.99) slanted += 1;
    expect(slanted).toBeGreaterThan(0);
  });

  it('stays light: a few hundred triangles at most', () => {
    for (const g of [...geometries, scaffoldGeometry(), craneGeometry()]) expect(triangleCount(g)).toBeLessThan(400);
  });
});
