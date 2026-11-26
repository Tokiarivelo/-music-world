import { describe, expect, it } from 'vitest';
import { loadModelMesh, toDisplayColors } from './model-mesh';

describe('model-mesh', () => {
  it('turns linear colours into display colours, keeping 0 and 1', () => {
    const out = toDisplayColors([0, 1, 0.5, -1]);
    expect(out[0]).toBe(0);
    expect(out[1]).toBe(1);
    expect(out[2]).toBeGreaterThan(0.5);
    expect(out[3]).toBe(0);
  });

  it('has no mesh for a kind without an authored model', async () => {
    expect(await loadModelMesh('building')).toBeNull();
  });
});
