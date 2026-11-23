import fc from 'fast-check';
import { describe, expect, it } from 'vitest';
import { hashSeed, hashString, mulberry32, noteStream, uniform } from './prng';

const take = (rng: () => number, n: number): number[] => Array.from({ length: n }, () => rng());
const isUint32 = (x: number): boolean => Number.isInteger(x) && x >= 0 && x < 2 ** 32;

describe('hashString', () => {
  it('matches the FNV-1a 32-bit reference values', () => {
    expect(hashString('')).toBe(0x811c9dc5);
    expect(hashString('a')).toBe(0xe40c292c);
    expect(hashString('foobar')).toBe(0xbf9cf968);
  });

  it('is a deterministic unsigned 32-bit integer for any string', () => {
    fc.assert(
      fc.property(fc.string({ unit: 'binary' }), (text) => {
        const h = hashString(text);
        expect(isUint32(h)).toBe(true);
        expect(hashString(text)).toBe(h);
      }),
    );
  });

  it('distinguishes strings that differ only in their last UTF-16 code unit (FNV step is a bijection)', () => {
    fc.assert(
      fc.property(
        fc.string(),
        fc.integer({ min: 0, max: 0xffff }),
        // Flip any non-empty subset of bits, either byte: catches hashes that drop the high byte.
        fc.oneof(fc.integer({ min: 1, max: 0xff }), fc.integer({ min: 1, max: 0xff }).map((k) => k << 8)),
        (prefix, a, flip) => {
          const b = a ^ flip;
          expect(hashString(prefix + String.fromCharCode(a))).not.toBe(hashString(prefix + String.fromCharCode(b)));
        },
      ),
    );
  });
});

describe('hashSeed', () => {
  it('is a deterministic unsigned 32-bit integer and only uses the low 32 bits of the seed', () => {
    fc.assert(
      fc.property(fc.integer({ min: 0, max: 2 ** 32 - 1 }), fc.string(), (seed, key) => {
        const h = hashSeed(seed, key);
        expect(isUint32(h)).toBe(true);
        expect(hashSeed(seed, key)).toBe(h);
        expect(hashSeed(seed + 2 ** 32, key)).toBe(h);
      }),
    );
  });

  it('changes with the seed and with the key (no collisions over a realistic note-id set)', () => {
    const ids = Array.from({ length: 20_000 }, (_, i) => `n${i}`);
    expect(new Set(ids.map((id) => hashSeed(7, id))).size).toBeGreaterThan(19_990);
    const seeds = Array.from({ length: 20_000 }, (_, i) => i);
    expect(new Set(seeds.map((s) => hashSeed(s, 'n0'))).size).toBeGreaterThan(19_990);
  });
});

describe('mulberry32', () => {
  it('matches pinned reference outputs (guards against accidental algorithm changes)', () => {
    expect(take(mulberry32(0), 3)).toEqual([0.26642920868471265, 0.0003297457005828619, 0.2232720274478197]);
    expect(take(mulberry32(42), 3)).toEqual([0.6011037519201636, 0.44829055899754167, 0.8524657934904099]);
  });

  it('is deterministic: the same seed yields the same sequence', () => {
    fc.assert(
      fc.property(fc.integer(), fc.integer({ min: 1, max: 64 }), (seed, n) => {
        expect(take(mulberry32(seed), n)).toEqual(take(mulberry32(seed), n));
      }),
    );
  });

  it('always yields floats in [0, 1)', () => {
    fc.assert(
      fc.property(fc.double({ noNaN: true }), (seed) => {
        for (const x of take(mulberry32(seed), 32)) {
          expect(x).toBeGreaterThanOrEqual(0);
          expect(x).toBeLessThan(1);
        }
      }),
    );
  });

  it('is roughly uniform (mean and decile counts over 100 000 draws)', () => {
    const n = 100_000;
    const draws = take(mulberry32(1234), n);
    const mean = draws.reduce((s, x) => s + x, 0) / n;
    expect(Math.abs(mean - 0.5)).toBeLessThan(0.005);
    const bins = new Array<number>(10).fill(0);
    for (const x of draws) bins[Math.floor(x * 10)]! += 1;
    for (const count of bins) expect(Math.abs(count - n / 10)).toBeLessThan(n / 100);
  });
});

describe('noteStream', () => {
  it('does not depend on the order in which notes are visited (req 1.4)', () => {
    fc.assert(
      fc.property(
        fc.integer(),
        fc.uniqueArray(fc.string({ minLength: 1, maxLength: 12 }), { minLength: 1, maxLength: 40 }),
        fc.array(fc.nat(), { maxLength: 40 }),
        (seed, ids, swaps) => {
          const firstDraws = (order: string[]) =>
            Object.fromEntries(order.map((id) => [id, take(noteStream(seed, id), 4)]));
          const shuffled = [...ids];
          swaps.forEach((k, i) => {
            const j = k % shuffled.length;
            const a = i % shuffled.length;
            [shuffled[a], shuffled[j]] = [shuffled[j]!, shuffled[a]!];
          });
          expect(firstDraws(shuffled)).toEqual(firstDraws(ids));
        },
      ),
    );
  });

  it('gives distinct notes distinct streams', () => {
    const first = Array.from({ length: 5_000 }, (_, i) => noteStream(99, `n${i}`)());
    expect(new Set(first).size).toBeGreaterThan(4_990);
  });
});

describe('uniform', () => {
  it('stays within [min, max] for any range (rounding may reach max)', () => {
    fc.assert(
      fc.property(
        fc.integer(),
        fc.double({ min: -1e6, max: 1e6, noNaN: true }),
        fc.double({ min: 1e-3, max: 1e6, noNaN: true }),
        (seed, min, width) => {
          const max = min + width;
          const rng = mulberry32(seed);
          for (let i = 0; i < 16; i += 1) {
            const x = uniform(rng, min, max);
            expect(x).toBeGreaterThanOrEqual(min);
            expect(x).toBeLessThanOrEqual(max);
          }
        },
      ),
    );
  });
});
