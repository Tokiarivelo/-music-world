// Random analyses for engine property tests (shape of music-world.analysis.v1, invariants of 02-music-analysis).
import fc from 'fast-check';
import type { ChordEvent, EngineAnalysis, NoteEvent } from '../types';
import { STEMS } from './templates';

interface Options {
  readonly maxNotes?: number;
  readonly duration?: number;
}

/** Notes sorted by time, unique ids `n_<i>`; chords group 3 consecutive notes sharing an onset. */
export function analysisArb({ maxNotes = 300, duration = 180 }: Options = {}): fc.Arbitrary<EngineAnalysis> {
  const rawNote = fc.record({
    time: fc.double({ min: 0, max: duration - 0.01, noNaN: true }),
    duration: fc.double({ min: 0.02, max: 4, noNaN: true }),
    midi: fc.integer({ min: 0, max: 127 }),
    velocity: fc.double({ min: 0, max: 1, noNaN: true }),
    stem: fc.constantFrom(...STEMS),
    chord: fc.boolean(),
  });
  return fc
    .record({
      raw: fc.array(rawNote, { maxLength: maxNotes }),
      tempoBpm: fc.integer({ min: 40, max: 220 }),
    })
    .map(({ raw, tempoBpm }) => buildAnalysis(raw, tempoBpm, duration));
}

type RawNote = Omit<NoteEvent, 'id' | 'chordId'> & { chord: boolean };

function buildAnalysis(raw: readonly RawNote[], tempoBpm: number, durationSec: number): EngineAnalysis {
  const sorted = [...raw].sort((a, b) => a.time - b.time || a.midi - b.midi);
  const notes: NoteEvent[] = [];
  const chords: ChordEvent[] = [];
  for (let i = 0; i < sorted.length; i++) {
    const r = sorted[i]!;
    const id = `n_${String(i).padStart(4, '0')}`;
    const startsChord = r.chord && i + 2 < sorted.length && i % 3 === 0;
    const chordId = startsChord ? `c_${chords.length}` : null;
    if (startsChord) {
      const memberIds = [id, `n_${String(i + 1).padStart(4, '0')}`, `n_${String(i + 2).padStart(4, '0')}`];
      chords.push({ id: chordId!, time: r.time, duration: r.duration, label: 'Am', noteIds: memberIds });
    }
    const inPrevChord = chords.find((c) => c.noteIds.includes(id));
    notes.push({
      id,
      time: r.time,
      duration: r.duration,
      midi: r.midi,
      velocity: r.velocity,
      stem: r.stem,
      chordId: inPrevChord ? inPrevChord.id : chordId,
    });
  }
  const beat = 60 / tempoBpm;
  const beats = Array.from({ length: Math.floor(durationSec / beat) }, (_, k) => k * beat);
  const energy = Array.from({ length: 11 }, (_, k) => ({ time: (k * durationSec) / 10, value: (k % 5) / 4 }));
  return { durationSec, tempoBpm, beats, notes, chords, energy };
}
