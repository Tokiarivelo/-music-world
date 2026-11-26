import { describe, expect, it } from 'vitest';
import type { Zone } from '../consts/template-editor.consts';
import { applyZonePreset, coveragePercent, presetOf, zoneRect } from './zone-model';

const zone = { kind: 'tree', xMin: -0.2, xMax: 0.2, zMin: -0.2, zMax: 0.2 } as Zone;

describe('zone-model', () => {
  it('applies a preset and recognises it again', () => {
    const left = applyZonePreset(zone, 'left');
    expect(left).toMatchObject({ kind: 'tree', xMin: -1, xMax: 0, zMin: -1, zMax: 1 });
    expect(presetOf(left)).toBe('left');
    expect(presetOf(zone)).toBeNull();
  });
  it('computes the coverage of the plate', () => {
    expect(coveragePercent(applyZonePreset(zone, 'whole'))).toBe(100);
    expect(coveragePercent(applyZonePreset(zone, 'right'))).toBe(50);
    expect(coveragePercent(applyZonePreset(zone, 'centre'))).toBe(25);
    expect(coveragePercent({ ...zone, xMin: 0.5, xMax: 0 })).toBe(0);
  });
  it('maps a zone to the top view: far edge at the top', () => {
    expect(zoneRect(applyZonePreset(zone, 'far'), 100)).toEqual({ x: 0, y: 0, w: 100, h: 50 });
    expect(zoneRect(applyZonePreset(zone, 'near'), 100)).toEqual({ x: 0, y: 50, w: 100, h: 50 });
  });
});
