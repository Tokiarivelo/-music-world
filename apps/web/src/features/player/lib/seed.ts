/** World seed of an uploaded song: derived from its audio hash, so the same song always builds the same world. */
export function seedFromHash(audioHash: string): number {
  const hex = audioHash.replace(/^sha256:/, '').slice(0, 8);
  const value = Number.parseInt(hex, 16);
  return Number.isFinite(value) ? value >>> 0 : 1;
}
