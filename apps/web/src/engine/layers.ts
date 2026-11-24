/**
 * Layers (I5): which parts of the song the viewer sees. View state only: `worldStateAt` and the spawn plan never read
 * a mask, so the same `(plan, t)` gives the same state whatever is hidden. Pure and framework-free.
 */
import type { SpawnPlan } from './spawn-plan';
import type { LyricSegment, Stem } from './types';

export const STEM_LAYERS = ['drums', 'bass', 'vocals', 'other'] as const satisfies readonly Stem[];
export const LAYER_IDS = [...STEM_LAYERS, 'chords', 'lyrics', 'fx', 'staff'] as const;
export type LayerId = (typeof LAYER_IDS)[number];

/**
 * One distinct color per layer: the swatch in the layers panel and the tint of that layer's notes on the 3D staff, so a
 * note can be told apart by what plays it. A note's own color or its line's color (I9) wins over this one.
 */
export const LAYER_COLORS: Readonly<Record<LayerId, string>> = {
  drums: '#ff9a3c',
  bass: '#3c8dff',
  vocals: '#ff4fa8',
  other: '#4be3a0',
  chords: '#ffe14a',
  lyrics: '#f2f2ff',
  fx: '#b98cff',
  staff: '#ffffff', // the panel shows the template's staff color instead
};

/** The layers the viewer has switched off (empty = everything shown). */
export type HiddenLayers = ReadonlySet<LayerId>;

export const NOTHING_HIDDEN: HiddenLayers = new Set<LayerId>();

export type PresetId = 'everything' | 'rhythm' | 'melody' | 'voice';

/** Layers a preset keeps visible; the others are hidden. */
const PRESET_VISIBLE: Readonly<Record<PresetId, readonly LayerId[]>> = {
  everything: LAYER_IDS,
  rhythm: ['drums', 'bass', 'fx', 'staff'],
  melody: ['vocals', 'other', 'chords', 'fx', 'staff'],
  voice: ['vocals', 'lyrics', 'staff'],
};
export const PRESET_IDS: readonly PresetId[] = ['everything', 'rhythm', 'melody', 'voice'];

export function presetHidden(id: PresetId): HiddenLayers {
  const visible = new Set<LayerId>(PRESET_VISIBLE[id]);
  return new Set(LAYER_IDS.filter((layer) => !visible.has(layer)));
}

/** Which preset (if any) this exact set of hidden layers is. */
export function presetOf(hidden: HiddenLayers): PresetId | null {
  return PRESET_IDS.find((id) => sameSet(presetHidden(id), hidden)) ?? null;
}

function sameSet(a: HiddenLayers, b: HiddenLayers): boolean {
  if (a.size !== b.size) return false;
  for (const x of a) if (!b.has(x)) return false;
  return true;
}

export function toggleLayer(hidden: HiddenLayers, layer: LayerId): HiddenLayers {
  const next = new Set(hidden);
  if (next.has(layer)) next.delete(layer);
  else next.add(layer);
  return next;
}

/** Keeps only known layer ids (a stored value may come from another version). */
export function parseHidden(value: unknown): HiddenLayers {
  if (!Array.isArray(value)) return NOTHING_HIDDEN;
  const known = new Set<string>(LAYER_IDS);
  return new Set(value.filter((v): v is LayerId => typeof v === 'string' && known.has(v)));
}

/** True when the record of note `index` is shown: scenery (no stem) always is. */
export function isRecordShown(plan: SpawnPlan, index: number, hidden: HiddenLayers): boolean {
  const stem = plan.records[index]?.stem;
  return stem == null || !hidden.has(stem);
}

/** Lyrics at `t`: index of the segment being sung (−1 between segments) and of the next one (−1 after the last). */
export function lyricsAt(lyrics: readonly LyricSegment[], t: number): { current: number; next: number } {
  let lo = 0;
  let hi = lyrics.length;
  while (lo < hi) {
    const mid = (lo + hi) >>> 1;
    if (lyrics[mid]!.start <= t) lo = mid + 1;
    else hi = mid;
  }
  const last = lo - 1; // last segment that has started
  const current = last >= 0 && t < lyrics[last]!.end ? last : -1;
  const next = lo < lyrics.length ? lo : -1;
  return { current, next };
}

export type Activity = Readonly<Record<(typeof STEM_LAYERS)[number], number>>;

/** Loudest velocity of the notes sounding at `t` for each stem (0 when none): the meters of the layers panel. */
export function activityAt(plan: SpawnPlan, t: number): Activity {
  const out = { drums: 0, bass: 0, vocals: 0, other: 0 };
  const end = plan.onsets.length;
  let lo = 0;
  let hi = end;
  while (lo < hi) {
    const mid = (lo + hi) >>> 1;
    if (plan.onsets[mid]! <= t) lo = mid + 1;
    else hi = mid;
  }
  // Notes that started at most `MAX_NOTE_SEC` ago can still be sounding.
  for (let i = lo - 1; i >= 0; i -= 1) {
    const r = plan.records[i]!;
    if (t - r.onset > MAX_NOTE_SEC) break;
    if (r.stem && t < r.onset + r.duration && r.velocity > out[r.stem]) out[r.stem] = r.velocity;
  }
  return out;
}

const MAX_NOTE_SEC = 8;
