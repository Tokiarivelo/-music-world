import { describe, expect, it } from 'vitest';
import { SHAPE_TRIANGLE_BUDGET } from '../constants';
import { triangleCount } from '../shapes/builtin-shapes';
import { BRAVURA_OUTLINES } from './bravura-outlines';
import { bravuraGeometry, NOTE_GLYPH, NOTEHEAD_WIDTH, noteGlyphGeometry, parseGlyphPath } from './glyph-geometry';
import { radialAlphaTexture } from './halo-texture';

describe('Bravura glyphs (04-default-template requirement 4)', () => {
  it('parses every extracted outline into closed shapes under the triangle budget', () => {
    for (const name of Object.keys(BRAVURA_OUTLINES) as Array<keyof typeof BRAVURA_OUTLINES>) {
      const g = bravuraGeometry(name);
      expect(triangleCount(g)).toBeGreaterThan(5);
      expect(triangleCount(g)).toBeLessThanOrEqual(SHAPE_TRIANGLE_BUDGET);
    }
  });

  it('centres the notehead on the origin with the stem up (SMuFL: 3.5 staff spaces)', () => {
    for (const kind of Object.keys(NOTE_GLYPH) as Array<keyof typeof NOTE_GLYPH>) {
      const g = noteGlyphGeometry(kind);
      g.computeBoundingBox();
      const box = g.boundingBox!;
      expect(box.min.x).toBeCloseTo(-NOTEHEAD_WIDTH / 2, 1);
      expect(box.min.y).toBeGreaterThan(-0.7);
      expect(box.max.y).toBeCloseTo(3.5, 1);
    }
  });

  it('keeps the G clef holes (counters) and spans the staff', () => {
    const shapes = parseGlyphPath(BRAVURA_OUTLINES.gClef.path).toShapes();
    expect(shapes.reduce((n, s) => n + s.holes.length, 0)).toBeGreaterThan(0);
    const g = bravuraGeometry('gClef');
    g.computeBoundingBox();
    expect(g.boundingBox!.max.y - g.boundingBox!.min.y).toBeGreaterThan(6);
  });

  it('rejects malformed paths', () => {
    expect(() => parseGlyphPath('M 0 0 X 1 1')).toThrow();
    expect(() => parseGlyphPath('M 0 0 L 1')).toThrow();
  });

  it('builds a radial halo mask: opaque centre, transparent corners', () => {
    const t = radialAlphaTexture(16);
    const data = t.image.data as Uint8Array;
    const at = (x: number, y: number) => data[(y * 16 + x) * 4]!;
    expect(at(8, 8)).toBeGreaterThan(200);
    expect(at(0, 0)).toBe(0);
  });
});
