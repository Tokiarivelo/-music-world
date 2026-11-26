import { describe, expect, it } from 'vitest';
import { thumbnailFaces } from './thumbnail';

const tri = (z: number) => [0, 0, z, 1, 0, z, 0, 1, z];

describe('thumbnailFaces', () => {
  it('is empty without triangles', () => {
    expect(thumbnailFaces([])).toEqual([]);
  });

  it('fits every point in the unit square', () => {
    const faces = thumbnailFaces([...tri(0), ...tri(2), 3, 4, 5, -1, 2, 0, 0, 0, 7]);
    for (const f of faces) for (const v of f.points) {
      expect(v).toBeGreaterThanOrEqual(0);
      expect(v).toBeLessThanOrEqual(1);
    }
  });

  it('draws far faces first, deterministically', () => {
    const faces = thumbnailFaces([...tri(0), ...tri(2)]);
    expect(faces).toHaveLength(2);
    expect(faces[0]!.depth).toBeLessThanOrEqual(faces[1]!.depth);
    expect(thumbnailFaces([...tri(0), ...tri(2)])).toEqual(faces);
  });

  it('keeps the shade in range', () => {
    for (const f of thumbnailFaces([...tri(0), 0, 0, 0, 0, 0, 1, 1, 0, 0])) {
      expect(f.shade).toBeGreaterThanOrEqual(0.35);
      expect(f.shade).toBeLessThanOrEqual(1);
    }
  });
});
