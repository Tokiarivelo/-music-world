import fc from 'fast-check';
import { describe, expect, it } from 'vitest';
import {
  contrastRatio,
  generatePalette,
  hexToOklch,
  isAcceptable,
  liftBrightness,
  lockMerge,
  oklchToHex,
  PALETTE_ROLES,
  relativeLuminance,
} from './palette-generator';

const HEX = /^#[0-9a-f]{6}$/;

describe('palette-generator', () => {
  it('is deterministic per seed and differs across seeds', () => {
    expect(generatePalette('4F2A9')).toEqual(generatePalette('4F2A9'));
    expect(generatePalette('4F2A9')).not.toEqual(generatePalette('4F2AA'));
  });

  it('always yields valid hex, readable staff, bounded background (10 000 seeds)', () => {
    fc.assert(
      fc.property(fc.string({ minLength: 1, maxLength: 12 }), (seed) => {
        const p = generatePalette(seed);
        for (const r of PALETTE_ROLES) expect(p[r]).toMatch(HEX);
        expect(Math.abs(relativeLuminance(p.staff) - relativeLuminance(p.background))).toBeGreaterThanOrEqual(0.2);
        expect(contrastRatio(p.staff, p.background)).toBeGreaterThanOrEqual(4.5);
        expect(isAcceptable(p)).toBe(true);
        const bg = hexToOklch(p.background);
        expect(bg.L).toBeGreaterThan(0.22);
        expect(bg.L).toBeLessThan(0.48);
      }),
      { numRuns: 10000 },
    );
  });

  it('keeps locked colors', () => {
    const p = generatePalette('abc', { locked: { primary: '#123456' } });
    expect(p.primary).toBe('#123456');
    expect(lockMerge(generatePalette('x'), { accent: '#ffffff' }).accent).toBe('#ffffff');
  });

  it('brightness lift raises the background and keeps label contrast', () => {
    fc.assert(
      fc.property(fc.string({ minLength: 1, maxLength: 8 }), fc.double({ min: -1, max: 1, noNaN: true }), (seed, k) => {
        const p = generatePalette(seed);
        const q = liftBrightness(p, k);
        expect(q.background).toMatch(HEX);
        expect(contrastRatio(q.staff, q.background)).toBeGreaterThanOrEqual(4.5);
        expect(q.primary).toBe(p.primary);
      }),
      { numRuns: 300 },
    );
    const p = generatePalette('lift');
    expect(hexToOklch(liftBrightness(p, 0.3).background).L).toBeGreaterThanOrEqual(hexToOklch(p.background).L);
  });

  it('round-trips OKLCH within a small error', () => {
    const { L, h } = hexToOklch(oklchToHex(0.6, 0.12, 200));
    expect(L).toBeCloseTo(0.6, 1);
    expect(h).toBeGreaterThan(190);
    expect(h).toBeLessThan(210);
  });
});
