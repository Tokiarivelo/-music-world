import { BoxGeometry } from 'three';
import { describe, expect, it } from 'vitest';
import { buildShapeGeometry } from './builtin-shapes';
import { UV_TILING, withLitAttributes } from './lit-geometry';
import { TEXTURE_SET, isPolishedKind } from './polished-materials';

describe('lit geometry (I20)', () => {
  it.each(['tree', 'conifer', 'bush', 'car', 'bicycle', 'airplane', 'cloud', 'crystal', 'cluster'] as const)(
    '%s gets normals and finite, non-degenerate uvs for every vertex',
    (kind) => {
      const g = withLitAttributes(buildShapeGeometry(kind));
      const pos = g.getAttribute('position');
      const uv = g.getAttribute('uv');
      expect(g.hasAttribute('normal')).toBe(true);
      expect(uv.count).toBe(pos.count);
      let spanU = 0;
      for (let i = 0; i < uv.count; i++) {
        expect(Number.isFinite(uv.getX(i)) && Number.isFinite(uv.getY(i))).toBe(true);
        spanU = Math.max(spanU, Math.abs(uv.getX(i)));
      }
      expect(spanU).toBeGreaterThan(0);
      expect(spanU).toBeLessThanOrEqual(UV_TILING * 1.01); // the shape is within the unit footprint
    },
  );

  it('projects a box face along its own axis', () => {
    const g = withLitAttributes(new BoxGeometry(1, 1, 1));
    const pos = g.getAttribute('position');
    const uv = g.getAttribute('uv');
    // a top-face vertex (y = 0.5, normal +y) maps to (x, z) × tiling
    const i = Array.from({ length: pos.count }, (_, k) => k).find((k) => pos.getY(k) > 0.49 && g.getAttribute('normal').getY(k) > 0.9)!;
    expect(uv.getX(i)).toBeCloseTo(pos.getX(i) * UV_TILING, 6);
    expect(uv.getY(i)).toBeCloseTo(pos.getZ(i) * UV_TILING, 6);
  });

  it('every textured kind is a polished kind', () => {
    for (const kind of Object.keys(TEXTURE_SET)) expect(isPolishedKind(kind)).toBe(true);
  });
});
