/**
 * Seeded pseudo-random numbers for the world engine.
 *
 * Everything random in a spawn plan comes from here, so the same (analysis, template, seed) always builds the same
 * world. Each note gets its own stream, `noteStream(seed, noteId)`, so a note's placement never depends on the order
 * in which notes are visited (requirement 1.4).
 */

/** A generator of uniform floats in [0, 1). */
export type Rng = () => number;

const FNV_OFFSET_BASIS = 0x811c9dc5;
const FNV_PRIME = 0x01000193;
const GOLDEN_GAMMA = 0x9e3779b9;
const UINT32_RANGE = 4294967296;

/** 32-bit FNV-1a hash of the UTF-16 code units of `text`, as an unsigned integer. */
export function hashString(text: string): number {
  let hash = FNV_OFFSET_BASIS;
  for (let i = 0; i < text.length; i += 1) {
    hash ^= text.charCodeAt(i);
    hash = Math.imul(hash, FNV_PRIME);
  }
  return hash >>> 0;
}

/** MurmurHash3 finalizer: spreads every input bit over the whole 32-bit output. */
function fmix32(value: number): number {
  let h = value >>> 0;
  h ^= h >>> 16;
  h = Math.imul(h, 0x85ebca6b);
  h ^= h >>> 13;
  h = Math.imul(h, 0xc2b2ae35);
  h ^= h >>> 16;
  return h >>> 0;
}

/** Combines a numeric seed and a string key into one unsigned 32-bit seed. */
export function hashSeed(seed: number, key: string): number {
  return fmix32(hashString(key) ^ Math.imul(seed >>> 0, GOLDEN_GAMMA));
}

/** mulberry32: small, fast, full-period 32-bit generator. Only the low 32 bits of `seed` are used. */
export function mulberry32(seed: number): Rng {
  let state = seed >>> 0;
  return () => {
    state = (state + 0x6d2b79f5) | 0;
    let t = Math.imul(state ^ (state >>> 15), 1 | state);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / UINT32_RANGE;
  };
}

/** The independent random stream of one note: `mulberry32(hashSeed(seed, noteId))`. */
export function noteStream(seed: number, noteId: string): Rng {
  return mulberry32(hashSeed(seed, noteId));
}

/** Uniform float in [min, max) drawn from `rng`. */
export function uniform(rng: Rng, min: number, max: number): number {
  return min + (max - min) * rng();
}
