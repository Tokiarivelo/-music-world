import { describe, expect, it } from 'vitest';
import {
  DIORAMA_POSITION,
  DIORAMA_WIDTH_M,
  EYE_HEIGHT_M,
  IMMERSIVE_PLATE_M,
} from './constants';
import { anchorPlacement, cameraFar, environmentScale, fogRange, plateWidthM, rootScale, scaleStore } from './scale';

describe('world scale', () => {
  it('keeps the diorama as it was', () => {
    expect(plateWidthM('diorama')).toBe(DIORAMA_WIDTH_M);
    expect(rootScale('diorama', 12)).toBeCloseTo(DIORAMA_WIDTH_M / 12);
    expect(anchorPlacement('diorama')).toEqual(DIORAMA_POSITION);
    expect(environmentScale('diorama')).toBe(1);
  });

  it('makes the viewer small in the immersive scale', () => {
    // The plate is dozens of metres wide: the eye (1.6 m) is a small fraction of it, a table-top model is not.
    expect(plateWidthM('immersive')).toBe(IMMERSIVE_PLATE_M);
    expect(EYE_HEIGHT_M / IMMERSIVE_PLATE_M).toBeLessThan(0.05);
    expect(rootScale('immersive', 12)).toBeGreaterThan(rootScale('diorama', 12) * 20);
    expect(anchorPlacement('immersive').y).toBe(0); // the plate top is the floor
  });

  it('moves the horizon, the fog and the far plane out with the plate', () => {
    expect(fogRange('immersive').far).toBeGreaterThan(fogRange('diorama').far);
    expect(fogRange('immersive').near).toBeLessThan(fogRange('immersive').far);
    expect(cameraFar('immersive')).toBeGreaterThan(fogRange('immersive').far);
    // ground (60 m × k) must reach beyond the plate half width plus the walking margin
    expect(60 * environmentScale('immersive')).toBeGreaterThan(IMMERSIVE_PLATE_M);
  });

  it('guards against a zero terrain size', () => {
    expect(Number.isFinite(rootScale('immersive', 0))).toBe(true);
  });

  it('notifies subscribers only on a change', () => {
    const seen: string[] = [];
    const off = scaleStore.subscribe((m) => seen.push(m));
    scaleStore.set('immersive');
    scaleStore.set('immersive');
    scaleStore.set('diorama');
    off();
    scaleStore.set('immersive');
    scaleStore.set('diorama');
    expect(seen).toEqual(['immersive', 'diorama']);
  });
});
