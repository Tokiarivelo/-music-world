import fc from 'fast-check';
import { describe, expect, it } from 'vitest';
import { analysisArb } from './__fixtures__/analyses';
import { makeTemplate } from './__fixtures__/templates';
import { buildSpawnPlan } from './spawn-plan';
import { SKY_IDS, TIME_MODES, WEATHER_MODES, isMinorChord, resolveTime, skyWeights, weatherAt } from './weather';

const TPL = makeTemplate();
const UNIT = ['cloudCover', 'rain', 'storm', 'flash', 'sun', 'birds', 'wind'] as const;

describe('weather', () => {
  it('reads minor chords', () => {
    expect(['Am', 'F#m7', 'Dm', 'Bbm'].every(isMinorChord)).toBe(true);
    expect(['C', 'Amaj7', 'G7', 'Fmaj'].some(isMinorChord)).toBe(false);
  });

  it('keeps every value in [0, 1], in every mode, at any time', () => {
    fc.assert(
      fc.property(analysisArb({ maxNotes: 80, duration: 60 }), fc.double({ min: -5, max: 80, noNaN: true }), fc.constantFrom(...WEATHER_MODES), (analysis, t, mode) => {
        const w = weatherAt(buildSpawnPlan(analysis, TPL, 9), t, mode);
        for (const k of UNIT) {
          expect(w[k]).toBeGreaterThanOrEqual(0);
          expect(w[k]).toBeLessThanOrEqual(1);
        }
      }),
      { numRuns: 60 },
    );
  });

  it('is pure: the same time gives the same sky whatever was asked before', () => {
    fc.assert(
      fc.property(analysisArb({ maxNotes: 60, duration: 60 }), fc.double({ min: 0, max: 60, noNaN: true }), (analysis, t) => {
        const plan = buildSpawnPlan(analysis, TPL, 4);
        const first = weatherAt(plan, t);
        weatherAt(plan, t + 17);
        expect(weatherAt(plan, t)).toEqual(first);
      }),
      { numRuns: 30 },
    );
  });

  it('fixed modes override the music', () => {
    const plan = buildSpawnPlan({ durationSec: 30, tempoBpm: 100, beats: [], notes: [], chords: [], energy: [] }, TPL, 1);
    expect(weatherAt(plan, 5, 'clear').rain).toBe(0);
    expect(weatherAt(plan, 5, 'clear').sun).toBe(1);
    expect(weatherAt(plan, 5, 'storm').storm).toBe(1);
    expect(weatherAt(plan, 5, 'rain').rain).toBeGreaterThan(0.5);
  });

  it('flashes only during a storm, on a drum hit', () => {
    const kicks = Array.from({ length: 200 }, (_, i) => i * 0.5);
    const base = { durationSec: 100, tempoBpm: 120, beats: kicks, notes: [], chords: [], energy: [] };
    const plan = buildSpawnPlan(base, TPL, 3);
    const flashes = kicks.map((k) => weatherAt(plan, k + 0.01, 'storm').flash);
    expect(flashes.some((f) => f > 0.5)).toBe(true);
    expect(kicks.every((k) => weatherAt(plan, k + 0.01, 'clear').flash === 0)).toBe(true);
  });
});

describe('sky photos', () => {
  it('weights sum to 1 and stay in [0, 1] for every weather and time', () => {
    fc.assert(
      fc.property(fc.double({ min: 0, max: 1, noNaN: true }), fc.double({ min: 0, max: 1, noNaN: true }), fc.constantFrom('day', 'sunset', 'night' as const), (cloudCover, storm, time) => {
        const w = skyWeights({ cloudCover, storm }, time as 'day');
        expect(SKY_IDS.reduce((n, id) => n + w[id], 0)).toBeCloseTo(1, 9);
        for (const id of SKY_IDS) {
          expect(w[id]).toBeGreaterThanOrEqual(-1e-9);
          expect(w[id]).toBeLessThanOrEqual(1 + 1e-9);
        }
      }),
    );
  });

  it('picks the matching photo', () => {
    expect(skyWeights({ cloudCover: 0.05, storm: 0 }, 'day').clear).toBeGreaterThan(0.9);
    expect(skyWeights({ cloudCover: 1, storm: 1 }, 'day').storm).toBe(1);
    expect(skyWeights({ cloudCover: 0, storm: 0 }, 'night').night).toBe(1);
    expect(skyWeights({ cloudCover: 0.1, storm: 0 }, 'sunset').sunset).toBeGreaterThan(0.9);
  });

  it('resolves auto from the background luminance', () => {
    expect(TIME_MODES).toContain('auto');
    expect(resolveTime('auto', 0.009)).toBe('night');
    expect(resolveTime('auto', 0.05)).toBe('sunset');
    expect(resolveTime('auto', 0.4)).toBe('day');
    expect(resolveTime('day', 0)).toBe('day');
  });
});
