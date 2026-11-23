import fc from 'fast-check';
import { describe, expect, it } from 'vitest';
import { PINCH_PRESS, PINCH_RELEASE } from './constants';
import { PinchGesture } from './pinch';

describe('PinchGesture (07-xr-mode requirement 5)', () => {
  it('uses a press threshold in 0.7–0.8 (never 0.5) and a lower release threshold', () => {
    expect(PINCH_PRESS).toBeGreaterThanOrEqual(0.7);
    expect(PINCH_PRESS).toBeLessThanOrEqual(0.8);
    expect(PINCH_RELEASE).toBeLessThan(PINCH_PRESS);
    expect(() => new PinchGesture(0.5, 0.3)).toThrow(RangeError);
    expect(() => new PinchGesture(0.75, 0.8)).toThrow(RangeError);
  });

  it('presses at the press threshold and releases only under the release threshold', () => {
    const g = new PinchGesture();
    expect(g.update(0.5)).toBeNull();
    expect(g.update(0.74)).toBeNull();
    expect(g.update(0.75)).toBe('press');
    expect(g.update(1)).toBeNull();
    expect(g.update(0.65)).toBeNull(); // between thresholds: still pinched
    expect(g.isPinched).toBe(true);
    expect(g.update(0.59)).toBe('release');
    expect(g.update(0.7)).toBeNull(); // re-press needs the press threshold again
    expect(g.update(Number.NaN)).toBeNull();
  });

  it('alternates press / release edges and never presses below the press threshold (property)', () => {
    fc.assert(
      fc.property(fc.array(fc.double({ min: 0, max: 1, noNaN: true }), { maxLength: 200 }), (strengths) => {
        const g = new PinchGesture();
        let last: 'press' | 'release' = 'release';
        for (const s of strengths) {
          const edge = g.update(s);
          if (edge === 'press') {
            expect(s).toBeGreaterThanOrEqual(PINCH_PRESS);
            expect(last).toBe('release');
            last = edge;
          } else if (edge === 'release') {
            expect(s).toBeLessThan(PINCH_RELEASE);
            expect(last).toBe('press');
            last = edge;
          }
        }
      }),
    );
  });
});
