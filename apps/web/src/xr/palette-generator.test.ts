import fc from 'fast-check';
import { describe, expect, it } from 'vitest';
import {
  applyContrast,
  contrastRatio,
  generatePalette,
  hexToOklch,
  isAcceptable,
  lightLevelFor,
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

  it('contrast widens or narrows the base/neon gap and keeps staff readable', () => {
    fc.assert(
      fc.property(fc.string({ minLength: 1, maxLength: 8 }), fc.double({ min: -1, max: 1, noNaN: true }), (seed, k) => {
        const p = generatePalette(seed);
        const q = applyContrast(p, k);
        for (const r of PALETTE_ROLES) expect(q[r]).toMatch(HEX);
        expect(contrastRatio(q.staff, q.background)).toBeGreaterThanOrEqual(4.5);
      }),
      { numRuns: 500 },
    );
    const p = generatePalette('gap');
    const gap = (x: typeof p) => hexToOklch(x.primary).L - hexToOklch(x.background).L;
    expect(applyContrast(p, 0)).toBe(p);
    expect(gap(applyContrast(p, 0.8))).toBeGreaterThan(gap(p));
    expect(gap(applyContrast(p, -0.8))).toBeLessThan(gap(p));
  });

  it('light level is 1 at rest and bounded', () => {
    expect(lightLevelFor(0)).toBe(1);
    expect(lightLevelFor(9)).toBeCloseTo(1.4);
    expect(lightLevelFor(-9)).toBeCloseTo(0.6);
  });
});
