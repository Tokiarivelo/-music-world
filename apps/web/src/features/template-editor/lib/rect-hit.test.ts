import { describe, expect, it } from 'vitest';
import { triangleTouchesRect } from './rect-hit';

const rect = { x: 10, y: 10, w: 20, h: 20 };

describe('triangleTouchesRect', () => {
  it('hits when a corner of the triangle is inside the rectangle', () => {
    expect(triangleTouchesRect([15, 15], [100, 100], [100, 120], rect)).toBe(true);
  });

  it('hits a big triangle that covers the whole rectangle (no corner inside)', () => {
    expect(triangleTouchesRect([-100, -100], [200, -100], [50, 300], rect)).toBe(true);
  });

  it('hits when only an edge crosses the rectangle', () => {
    expect(triangleTouchesRect([0, 20], [40, 20], [20, 80], rect)).toBe(true);
    expect(triangleTouchesRect([0, 0], [40, 3], [0, 3], { x: 5, y: 1, w: 10, h: 1 })).toBe(true);
  });

  it('misses a triangle that is outside, even when the bounding boxes overlap', () => {
    expect(triangleTouchesRect([0, 0], [8, 0], [0, 40], { x: 6, y: 20, w: 20, h: 20 })).toBe(false);
    expect(triangleTouchesRect([100, 100], [120, 100], [100, 120], rect)).toBe(false);
  });
});
