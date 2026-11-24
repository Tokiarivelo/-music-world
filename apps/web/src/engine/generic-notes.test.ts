import { describe, expect, it } from 'vitest';
import { bigAnalysis } from './__fixtures__/analyses';
import { MAX_GENERIC_NOTES, extendWithGenericNotes } from './generic-notes';

const base = bigAnalysis(120, 7, 60);

describe('generic notes after the analysed part', () => {
  it('returns the same analysis when the song is not longer than the analysis', () => {
    expect(extendWithGenericNotes(base, base.durationSec)).toBe(base);
    expect(extendWithGenericNotes(base, base.durationSec + 0.5)).toBe(base);
  });

  it('adds one note per beat after the analysis, inside the song, without touching the analysed notes', () => {
    const total = base.durationSec + 30;
    const out = extendWithGenericNotes(base, total);
    expect(out.durationSec).toBe(total);
    expect(out.notes.slice(0, base.notes.length)).toEqual(base.notes);
    const added = out.notes.slice(base.notes.length);
    expect(added.length).toBeGreaterThan(10);
    for (const n of added) {
      expect(n.time).toBeGreaterThanOrEqual(base.durationSec);
      expect(n.time + n.duration).toBeLessThanOrEqual(total);
      expect(n.id.startsWith('g_')).toBe(true);
    }
    expect(new Set(out.notes.map((n) => n.id)).size).toBe(out.notes.length);
    expect(added.map((n) => n.time)).toEqual([...added.map((n) => n.time)].sort((a, b) => a - b));
  });

  it('draws its pitches from the pitch classes the song used and is deterministic', () => {
    const used = new Set(base.notes.map((n) => n.midi % 12));
    const a = extendWithGenericNotes(base, base.durationSec + 20);
    const b = extendWithGenericNotes(base, base.durationSec + 20);
    expect(a).toEqual(b);
    for (const n of a.notes.slice(base.notes.length)) expect(used.has(n.midi % 12)).toBe(true);
  });

  it('is capped for very long songs and falls back to a pentatonic when nothing was detected', () => {
    const long = extendWithGenericNotes(base, base.durationSec + 100_000);
    expect(long.notes.length - base.notes.length).toBe(MAX_GENERIC_NOTES);
    const empty = extendWithGenericNotes({ ...base, notes: [], beats: [], chords: [] }, base.durationSec + 10);
    expect(empty.notes.length).toBeGreaterThan(0);
    expect(empty.notes.every((n) => [60, 62, 64, 67, 69].includes(n.midi))).toBe(true);
  });
});
