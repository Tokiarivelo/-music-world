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

import { sceneFaces } from './thumbnail';

describe('sceneFaces', () => {
  const a = { id: 'a', positions: tri(0) };
  const b = { id: 'b', positions: tri(2) };

  it('keeps the group of every face and fits the groups together', () => {
    const faces = sceneFaces([a, b]);
    expect(faces.map((f) => f.id).sort()).toEqual(['a', 'b']);
    for (const f of faces) for (const v of f.points) expect(v).toBeGreaterThanOrEqual(0);
  });

  it('orbiting changes the projection and a full turn comes back', () => {
    const front = sceneFaces([a, b], { yaw: 0, pitch: 0.4 });
    const side = sceneFaces([a, b], { yaw: 1, pitch: 0.4 });
    const turn = sceneFaces([a, b], { yaw: Math.PI * 2, pitch: 0.4 });
    expect(side[0]!.points).not.toEqual(front[0]!.points);
    turn.forEach((f, i) => f.points.forEach((v, k) => expect(v).toBeCloseTo(front[i]!.points[k]!, 6)));
  });

  it('survives an extreme pitch', () => {
    for (const f of sceneFaces([a, b], { yaw: 0, pitch: 99 })) for (const v of f.points) expect(Number.isFinite(v)).toBe(true);
  });
});
