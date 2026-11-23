import { describe, expect, it } from 'vitest';
import { formatClock, panelTime, progressPercent } from './panel-format';

describe('panel text (07-xr-mode requirement 4.2)', () => {
  it('formats m:ss and clamps invalid values to 0', () => {
    expect(formatClock(0)).toBe('0:00');
    expect(formatClock(65.9)).toBe('1:05');
    expect(formatClock(-3)).toBe('0:00');
    expect(formatClock(Number.NaN)).toBe('0:00');
    expect(panelTime(12.4, 185)).toBe('0:12 / 3:05');
  });

  it('gives a whole, clamped progress percent', () => {
    expect(progressPercent(0, 100)).toBe(0);
    expect(progressPercent(33.4, 100)).toBe(33);
    expect(progressPercent(150, 100)).toBe(100);
    expect(progressPercent(5, 0)).toBe(0);
  });
});
