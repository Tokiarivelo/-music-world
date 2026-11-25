import fc from 'fast-check';
import { describe, expect, it } from 'vitest';
import { makeTemplate } from './__fixtures__/templates';
import { LAYOUT_CELL_MARGIN, LAYOUT_CELL_SIZE, PLATE_INSET } from './constants';
import { LAYOUT_MODES, isLayoutMode, pitchFraction, placeNote, zonesFor, type ZoneRect } from './layout';
import { parseRange } from './mapping';

const KINDS = ['terrain_ridge', 'building', 'spike', 'crystal', 'cluster', 'recipe:tower'] as const;

const unit = fc.double({ min: -1, max: 1, noNaN: true });
const zoneArb = fc
  .record({
    kind: fc.constantFrom(...KINDS),
    a: unit,
    b: unit,
    c: unit,
    d: unit,
  })
  .filter(({ a, b, c, d }) => Math.abs(a - b) > 1e-3 && Math.abs(c - d) > 1e-3)
  .map(({ kind, a, b, c, d }) => ({
    kind,
    xMin: Math.min(a, b),
    xMax: Math.max(a, b),
    zMin: Math.min(c, d),
    zMax: Math.max(c, d),
  }));
const rangeArb = fc.constantFrom(null, '<48', '>72', '48-72', '0-127', '60-60').map((r) => (r ? parseRange(r) : null));

function inside(p: { x: number; z: number }, z: ZoneRect): boolean {
  return p.x >= z.xMin && p.x <= z.xMax && p.z >= z.zMin && p.z <= z.zMax;
}

describe('zonesFor', () => {
  it('scales normalized zones to the inset plate and defaults to the whole plate', () => {
    const tpl = makeTemplate({
      terrain: { size: 10 },
      zones: [{ kind: 'building', xMin: -1, xMax: 0, zMin: 0.5, zMax: 1 }],
    });
    const half = 5 * PLATE_INSET;
    expect(zonesFor('building', tpl)).toEqual([{ xMin: -half, xMax: 0, zMin: 0.5 * half, zMax: half }]);
    expect(zonesFor('spike', tpl)).toEqual([{ xMin: -half, xMax: half, zMin: -half, zMax: half }]);
  });

  it('orders swapped bounds and ignores degenerate zones (zod does not re-check min < max)', () => {
    const tpl = makeTemplate({
      terrain: { size: 4 },
      zones: [
        { kind: 'spike', xMin: 0.5, xMax: -0.5, zMin: 1, zMax: 0 },
        { kind: 'spike', xMin: 0.2, xMax: 0.2, zMin: 0, zMax: 1 },
      ],
    });
    const h = 2 * PLATE_INSET;
    expect(zonesFor('spike', tpl)).toEqual([{ xMin: -0.5 * h, xMax: 0.5 * h, zMin: 0, zMax: h }]);
  });
});

describe('placeNote (requirement 1.4)', () => {
  it('every target lies inside one of the zones of its kind, on the plate top', () => {
    fc.assert(
      fc.property(
        fc.array(zoneArb, { maxLength: 6 }),
        fc.constantFrom(...KINDS),
        fc.double({ min: 4, max: 40, noNaN: true }),
        fc.integer(),
        fc.integer({ min: 0, max: 9999 }),
        fc.integer({ min: 0, max: 127 }),
        rangeArb,
        (zones, kind, size, seed, n, midi, range) => {
          const tpl = makeTemplate({ terrain: { size }, zones });
          const rects = zonesFor(kind, tpl);
          const p = placeNote(seed, `n_${n}`, midi, range, rects);
          expect(p.y).toBe(0);
          expect(rects.some((r) => inside(p, r))).toBe(true);
          const half = (size / 2) * PLATE_INSET;
          expect(Math.abs(p.x) <= half && Math.abs(p.z) <= half).toBe(true);
        },
      ),
    );
  });

  it('is deterministic and depends only on seed, note id and pitch', () => {
    const zones = zonesFor('building', makeTemplate());
    fc.assert(
      fc.property(fc.integer(), fc.string(), fc.integer({ min: 0, max: 127 }), rangeArb, (seed, id, midi, range) => {
        expect(placeNote(seed, id, midi, range, zones)).toEqual(placeNote(seed, id, midi, range, zones));
      }),
    );
  });

  it('changes with the seed (different seeds give different worlds)', () => {
    const zones = zonesFor('building', makeTemplate());
    const positions = new Set(
      Array.from({ length: 50 }, (_, s) => JSON.stringify(placeNote(s, 'n_0001', 60, null, zones))),
    );
    expect(positions.size).toBeGreaterThan(45);
  });

  it('pitch picks the grid column (low notes left) and the jitter keeps the cell margin', () => {
    fc.assert(
      fc.property(
        zoneArb,
        fc.integer(),
        fc.integer({ min: 0, max: 9999 }),
        fc.integer({ min: 0, max: 127 }),
        rangeArb,
        (zone, seed, n, midi, range) => {
          const [rect] = zonesFor(zone.kind, makeTemplate({ zones: [zone] }));
          const r = rect!;
          const cols = Math.max(1, Math.floor((r.xMax - r.xMin) / LAYOUT_CELL_SIZE));
          const rows = Math.max(1, Math.floor((r.zMax - r.zMin) / LAYOUT_CELL_SIZE));
          const p = placeNote(seed, `n_${n}`, midi, range, [r]);
          const u = ((p.x - r.xMin) / (r.xMax - r.xMin)) * cols;
          const v = ((p.z - r.zMin) / (r.zMax - r.zMin)) * rows;
          const eps = 1e-9;
          expect(Math.floor(u)).toBe(Math.min(cols - 1, Math.floor(pitchFraction(midi, range) * cols)));
          expect(u - Math.floor(u)).toBeGreaterThanOrEqual(LAYOUT_CELL_MARGIN - eps);
          expect(u - Math.floor(u)).toBeLessThanOrEqual(1 - LAYOUT_CELL_MARGIN + eps);
          expect(v - Math.floor(v)).toBeGreaterThanOrEqual(LAYOUT_CELL_MARGIN - eps);
          expect(v - Math.floor(v)).toBeLessThanOrEqual(1 - LAYOUT_CELL_MARGIN + eps);
        },
      ),
    );
  });

  it('spreads notes over every zone of a kind', () => {
    const tpl = makeTemplate({
      zones: [
        { kind: 'terrain_ridge', xMin: -1, xMax: -0.8, zMin: -1, zMax: 1 },
        { kind: 'terrain_ridge', xMin: 0.8, xMax: 1, zMin: -1, zMax: 1 },
        { kind: 'terrain_ridge', xMin: -0.5, xMax: 0.5, zMin: 0.8, zMax: 1 },
      ],
    });
    const rects = zonesFor('terrain_ridge', tpl);
    const used = new Set<number>();
    for (let i = 0; i < 200; i++) {
      const p = placeNote(1, `n_${i}`, 40, null, rects);
      used.add(rects.findIndex((r) => inside(p, r)));
    }
    expect([...used].sort()).toEqual([0, 1, 2]);
  });

  it('pitchFraction stays in [0, 1] and uses the piano range for open bounds', () => {
    expect(pitchFraction(21, parseRange('<48'))).toBe(0);
    expect(pitchFraction(108, parseRange('>72'))).toBe(1);
    expect(pitchFraction(60, parseRange('60-60'))).toBe(0.5);
    fc.assert(
      fc.property(fc.integer({ min: 0, max: 127 }), rangeArb, (m, r) => {
        const f = pitchFraction(m, r);
        expect(f >= 0 && f <= 1).toBe(true);
      }),
    );
  });
});

describe('layout modes', () => {
  const zone: ZoneRect = { xMin: -3, xMax: 5, zMin: -2, zMax: 6 };

  it('keeps every mode inside its zone and deterministic', () => {
    fc.assert(
      fc.property(fc.constantFrom(...LAYOUT_MODES), fc.integer(), fc.string(), fc.integer({ min: 21, max: 108 }), (mode, seed, id, midi) => {
        const a = placeNote(seed, id, midi, null, [zone], mode);
        expect(a).toEqual(placeNote(seed, id, midi, null, [zone], mode));
        expect(inside(a, zone)).toBe(true);
      }),
    );
  });

  it('defaults to the grid and rows put high notes farther than low notes', () => {
    expect(placeNote(1, 'a', 60, null, [zone])).toEqual(placeNote(1, 'a', 60, null, [zone], 'grid'));
    const low = placeNote(1, 'a', 25, null, [zone], 'rows');
    const high = placeNote(1, 'a', 105, null, [zone], 'rows');
    expect(high.z).toBeLessThan(low.z);
  });

  it('knows its mode names', () => {
    expect(isLayoutMode('ring')).toBe(true);
    expect(isLayoutMode('hexagon')).toBe(false);
  });
});
