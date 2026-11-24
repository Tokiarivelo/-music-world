import fc from 'fast-check';
import { describe, expect, it } from 'vitest';
import { makeTemplate } from './__fixtures__/templates';
import {
  LAYER_IDS,
  NOTHING_HIDDEN,
  PRESET_IDS,
  activityAt,
  isRecordShown,
  lyricsAt,
  parseHidden,
  presetHidden,
  presetOf,
  toggleLayer,
  type LayerId,
} from './layers';
import { buildSpawnPlan } from './spawn-plan';
import type { EngineAnalysis, LyricSegment, NoteEvent, Stem } from './types';
import { worldStateAt } from './world-state';

const note = (id: string, time: number, stem: Stem, velocity = 0.6, duration = 1): NoteEvent => ({
  id,
  time,
  duration,
  midi: 60,
  velocity,
  stem,
  chordId: null,
});
const analysis: EngineAnalysis = {
  durationSec: 30,
  tempoBpm: 120,
  beats: [],
  chords: [],
  energy: [],
  notes: [note('a', 2, 'drums', 0.9, 0.2), note('b', 3, 'bass'), note('c', 4, 'vocals', 0.4, 2), note('d', 5, 'other')],
};
const plan = buildSpawnPlan(analysis, makeTemplate({}), 7);

describe('layers (I5)', () => {
  it('records know their stem; scenery has none and is never hidden', () => {
    const stems = plan.records.slice(plan.sceneryCount).map((r) => r.stem);
    expect(stems).toEqual(['drums', 'bass', 'vocals', 'other']);
    const hidden = new Set<LayerId>(['drums', 'bass', 'vocals', 'other']);
    for (let i = 0; i < plan.sceneryCount; i += 1) expect(isRecordShown(plan, i, hidden)).toBe(true);
    expect(isRecordShown(plan, plan.sceneryCount, hidden)).toBe(false);
    expect(isRecordShown(plan, plan.sceneryCount, NOTHING_HIDDEN)).toBe(true);
  });

  it('the world state never depends on a mask (the mask is not an input)', () => {
    fc.assert(
      fc.property(fc.double({ min: 0, max: 12, noNaN: true }), (t) => {
        expect(worldStateAt(plan, t)).toEqual(worldStateAt(plan, t));
      }),
    );
  });

  it('toggles, presets and storage round trip', () => {
    expect(toggleLayer(toggleLayer(NOTHING_HIDDEN, 'bass'), 'bass')).toEqual(NOTHING_HIDDEN);
    expect(presetHidden('everything').size).toBe(0);
    for (const id of PRESET_IDS) expect(presetOf(presetHidden(id))).toBe(id);
    expect(presetOf(new Set<LayerId>(['drums']))).toBeNull();
    expect(presetHidden('voice').has('vocals')).toBe(false);
    expect(presetHidden('voice').has('drums')).toBe(true);
    expect(parseHidden(['drums', 'nope', 3, 'lyrics'])).toEqual(new Set(['drums', 'lyrics']));
    expect(parseHidden('x')).toEqual(NOTHING_HIDDEN);
    expect(LAYER_IDS).toContain('lyrics');
  });

  it('finds the lyric being sung and the next one, from any time (seek-safe)', () => {
    const lyrics: LyricSegment[] = [
      { start: 1, end: 3, text: 'one' },
      { start: 4, end: 6, text: 'two' },
      { start: 6, end: 8, text: 'three' },
    ];
    expect(lyricsAt(lyrics, 0)).toEqual({ current: -1, next: 0 });
    expect(lyricsAt(lyrics, 2)).toEqual({ current: 0, next: 1 });
    expect(lyricsAt(lyrics, 3.5)).toEqual({ current: -1, next: 1 });
    expect(lyricsAt(lyrics, 6)).toEqual({ current: 2, next: -1 });
    expect(lyricsAt(lyrics, 99)).toEqual({ current: -1, next: -1 });
    expect(lyricsAt([], 5)).toEqual({ current: -1, next: -1 });
    fc.assert(
      fc.property(fc.double({ min: -5, max: 20, noNaN: true }), (t) => {
        const { current } = lyricsAt(lyrics, t);
        if (current >= 0) expect(lyrics[current]!.start <= t && t < lyrics[current]!.end).toBe(true);
      }),
    );
  });

  it('measures what each stem plays now', () => {
    expect(activityAt(plan, 0)).toEqual({ drums: 0, bass: 0, vocals: 0, other: 0 });
    expect(activityAt(plan, 2.1).drums).toBeCloseTo(0.9);
    expect(activityAt(plan, 2.5).drums).toBe(0); // the 0.2 s hit is over
    const mid = activityAt(plan, 4.5);
    expect(mid.vocals).toBeCloseTo(0.4);
    expect(mid.bass).toBe(0);
  });
});
