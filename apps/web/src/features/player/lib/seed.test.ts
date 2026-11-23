import { describe, expect, it } from 'vitest';
import { seedFromHash } from './seed';

describe('seedFromHash', () => {
  it('is stable per hash and a uint32', () => {
    const hash = `sha256:${'ab'.repeat(32)}`;
    expect(seedFromHash(hash)).toBe(0xabababab);
    expect(seedFromHash(hash)).toBe(seedFromHash(hash));
    expect(seedFromHash('sha256:zz')).toBe(1);
  });
});
