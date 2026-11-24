/**
 * A song longer than the analysed part (the first 5 minutes) still plays whole: after the analysis ends the world gets
 * generic notes, one per beat, drawn from the pitches the song itself used. Pure and deterministic; the real analysis
 * is never modified (a new object is returned), and nothing here claims to be the song's melody.
 */
import type { EngineAnalysis, NoteEvent } from './types';

/** Longest tail that gets generic notes (a 30 minute song at 120 BPM would otherwise add 3 600). */
export const MAX_GENERIC_NOTES = 1500;
const MIN_TAIL_SEC = 1;
const DEGREES = [0, 1, 2, 3, 2, 1, 4, 3] as const; // a gentle up-and-down contour over the song's own scale
const SCALE_SIZE = 5;
const VELOCITY = 0.5;

/** The `SCALE_SIZE` pitch classes the song used most (duration weighted), as a sorted list of MIDI notes around its median. */
function palette(notes: readonly NoteEvent[]): number[] {
  if (notes.length === 0) return [60, 62, 64, 67, 69]; // C major pentatonic when nothing was detected
  const weight = new Array<number>(12).fill(0);
  for (const n of notes) weight[n.midi % 12]! += n.duration;
  const classes = [...weight.keys()]
    .sort((a, b) => weight[b]! - weight[a]! || a - b)
    .slice(0, SCALE_SIZE)
    .sort((a, b) => a - b);
  const pitches = notes.map((n) => n.midi).sort((a, b) => a - b);
  const median = pitches[Math.floor(pitches.length / 2)]!;
  const base = median - (median % 12); // the octave of the median
  const out = classes.map((pc) => base + pc);
  while (out.length < SCALE_SIZE) out.push(out[out.length - 1]! + 12);
  return out.sort((a, b) => a - b);
}

/** `analysis` extended to `totalSec` with generic notes, beats and energy; the same object when there is nothing to add. */
export function extendWithGenericNotes(analysis: EngineAnalysis, totalSec: number): EngineAnalysis {
  const from = analysis.durationSec;
  if (!(totalSec > from + MIN_TAIL_SEC)) return analysis;
  const period = 60 / Math.max(30, Math.min(300, analysis.tempoBpm));
  const scale = palette(analysis.notes);
  const lastBeat = analysis.beats.length > 0 ? analysis.beats[analysis.beats.length - 1]! : 0;
  let t = Math.max(from, lastBeat + period);
  const notes: NoteEvent[] = [];
  const beats: number[] = [];
  for (let i = 0; t < totalSec - 0.05 && notes.length < MAX_GENERIC_NOTES; i += 1, t += period) {
    const degree = DEGREES[i % DEGREES.length]!;
    notes.push({
      id: `g_${String(i).padStart(4, '0')}`,
      time: Math.round(t * 1e4) / 1e4,
      duration: Math.round(period * 0.8 * 1e4) / 1e4,
      midi: scale[degree % scale.length]!,
      velocity: VELOCITY,
      stem: 'other',
      chordId: null,
    });
    beats.push(Math.round(t * 1e4) / 1e4);
  }
  const mean = analysis.energy.length ? analysis.energy.reduce((s, e) => s + e.value, 0) / analysis.energy.length : 0.5;
  const energy = [...analysis.energy, { time: from, value: mean }, { time: totalSec, value: mean }];
  return {
    ...analysis,
    durationSec: totalSec,
    beats: [...analysis.beats, ...beats],
    notes: [...analysis.notes, ...notes],
    energy,
  };
}
