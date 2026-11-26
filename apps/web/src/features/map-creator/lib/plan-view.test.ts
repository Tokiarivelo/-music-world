import { describe, expect, it } from 'vitest';
import * as v from './plan-view';

const view: v.PlanView = { size: 400, half: 10 };

describe('plan view', () => {
  it('maps ground to pixels and back', () => {
    expect(v.toScreen(view, 0, 0)).toEqual({ x: 200, y: 200 });
    expect(v.toScreen(view, -10, 10)).toEqual({ x: 0, y: 400 });
    for (const [x, z] of [[3.5, -7.25], [0, 0], [10, -10]] as const) {
      const p = v.toScreen(view, x, z);
      const w = v.toWorld(view, p.x, p.y);
      expect(w.x).toBeCloseTo(x, 9);
      expect(w.z).toBeCloseTo(z, 9);
    }
  });

  it('rotates by the handle: yaw 0 up, 90 right, and the pointer gives it back', () => {
    const c = { x: 100, y: 100 };
    expect(v.rotateHandle(c, 1, 0).y).toBeLessThan(100);
    expect(v.rotateHandle(c, 1, 90).x).toBeGreaterThan(100);
    for (const yaw of [-170, -45, 0, 30, 90, 175]) {
      expect(v.yawFromPointer(c, v.rotateHandle(c, 2, yaw))).toBeCloseTo(yaw, 6);
    }
  });

  it('scales by the handle, within range', () => {
    const c = { x: 0, y: 0 };
    for (const s of [0.5, 1, 2.5]) expect(v.scaleFromPointer(c, v.scaleHandle(c, s))).toBeCloseTo(s, 6);
    expect(v.scaleFromPointer(c, { x: 1000, y: 0 })).toBe(5);
    expect(v.scaleFromPointer(c, { x: 0, y: 0 })).toBe(0.2);
  });

  it('hits handles of the selection first, then the nearest object, else the ground', () => {
    const a = { id: 'a', x: 0, z: 0, scale: 1, yaw: 0 };
    const b = { id: 'b', x: 0.1, z: 0, scale: 1, yaw: 0 };
    const c = v.toScreen(view, 0, 0);
    expect(v.hitTest(view, [a, b], null, c)).toEqual({ type: 'object', id: 'a' });
    expect(v.hitTest(view, [a], 'a', v.rotateHandle(c, 1, 0))).toEqual({ type: 'rotate', id: 'a' });
    expect(v.hitTest(view, [a], 'a', v.scaleHandle(c, 1))).toEqual({ type: 'scale', id: 'a' });
    expect(v.hitTest(view, [a], null, { x: 390, y: 390 })).toEqual({ type: 'ground' });
  });
});
