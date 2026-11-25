import { describe, expect, it } from 'vitest';
import { SHAPE_TRIANGLE_BUDGET } from '../constants';
import { buildShapeGeometry, triangleCount } from './builtin-shapes';

const OBJECT_KINDS = ['cloud', 'tree', 'conifer', 'bush', 'car', 'bicycle', 'airplane'] as const;

describe('object kinds (I8)', () => {
  it.each(OBJECT_KINDS)('%s fits the unit footprint, the unit height and the triangle budget', (kind) => {
    const geometry = buildShapeGeometry(kind);
    geometry.computeBoundingBox();
    const box = geometry.boundingBox!;
    expect(box.min.y).toBeCloseTo(0, 5);
    expect(box.max.y).toBeCloseTo(1, 5);
    expect(box.max.x - box.min.x).toBeLessThanOrEqual(1.0001);
    expect(box.max.z - box.min.z).toBeLessThanOrEqual(1.0001);
    expect(Math.max(box.max.x - box.min.x, box.max.z - box.min.z)).toBeCloseTo(1, 4);
    expect(triangleCount(geometry)).toBeGreaterThan(0);
    expect(triangleCount(geometry)).toBeLessThanOrEqual(SHAPE_TRIANGLE_BUDGET);
    expect(geometry.hasAttribute('color')).toBe(true);
  });
});
