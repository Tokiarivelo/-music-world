import { describe, expect, it } from 'vitest';
import { LANDSCAPES, LANDSCAPE_IDS, isLandscapeId } from './landscapes';
import { existsSync } from 'node:fs';
import { join } from 'node:path';

describe('landscapes', () => {
  it('describes every id and every ground tile exists', () => {
    for (const id of LANDSCAPE_IDS) {
      const l = LANDSCAPES[id];
      expect(l.id).toBe(id);
      if (l.texture) expect(existsSync(join(process.cwd(), 'public/ground', `${l.texture}.jpg`)), id).toBe(true);
      expect(l.hillAmp).toBeGreaterThan(0);
    }
    expect(isLandscapeId('desert')).toBe(true);
    expect(isLandscapeId('moon')).toBe(false);
  });
});
