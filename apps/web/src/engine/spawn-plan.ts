/**
 * Spawn plan (requirements 1.1–1.5): computed once per (analysis, template, seed); everything per-frame is derived
 * from it by `worldStateAt`. The plan is plain data (JSON-comparable) and is never mutated after creation.
 */
import {
  DURATION_FULL_BEATS,
  EIGHTH_MIN_BEATS,
  EMISSIVE_BASE,
  EMISSIVE_VELOCITY_SCALE,
  KIND_HEIGHT,
  MIN_GROW_SEC,
  QUARTER_MIN_BEATS,
  RECIPE_HEIGHT,
  SCENERY_LANDED_AT,
  SCENERY_VELOCITY_MAX,
  SCENERY_VELOCITY_MIN,
  PIANO_HIGH_MIDI,
  PIANO_LOW_MIDI,
  STAFF_U_MAX,
  STAFF_U_MIN,
} from './constants';
import { DEFAULT_LAYOUT, pitchFraction, placeNote, zonesFor, type LayoutMode, type ZoneRect } from './layout';
import { mapNote, type MappedNote } from './mapping';
import { noteStream, uniform } from './prng';
import { recipeScale } from './recipe-scale';
import { applyEdits, linesOf, staffUOfSnapped, MAIN_LINE_ID, type LayoutEdits, type StaffLine } from './edits';
import { buildStaffPath, lineOffsetY, type StaffPath } from './staff';
import type { EngineAnalysis, GlyphKind, NoteEvent, PaletteRole, ShapeKind, Stem, Vec3, WorldTemplate } from './types';

export interface SpawnRecord {
  readonly index: number;
  readonly noteId: string;
  /** Instrument of the note (I5 layers); null for template scenery. */
  readonly stem: Stem | null;
  /** Voice line of the note (I9); `main` for the analysis staff and for scenery. */
  readonly line: string;
  /** Height of the note's line above the main staff, in metres (0 for `main`). */
  readonly lineY: number;
  /** The note's own color (`#rrggbb`) when the user set one, else null. */
  readonly colorHex: string | null;
  readonly kind: ShapeKind;
  /** Instance slot within its kind: `indexWithinKind % budget` (the oldest slot is reused, requirement 1.5). */
  readonly slot: number;
  readonly onset: number;
  readonly duration: number;
  readonly velocity: number;
  readonly midi: number;
  /** Vertical position on the staff (0 = bottom line, 1 = top line). */
  readonly staffU: number;
  readonly glyph: GlyphKind;
  /** Time the note lands (onset + fall duration), and how long its structure grows. */
  readonly landAt: number;
  readonly growSec: number;
  readonly target: Vec3;
  readonly height: number;
  readonly emissive: number;
  /** Fixed palette role, or null for the default gradient (primary → accent → secondary) at `colorT`. */
  readonly colorRole: PaletteRole | null;
  /** Own color of the structure when its rule says `colorRole: "line"` (the line or note color), else null. */
  readonly structureHex: string | null;
  readonly colorT: number;
  readonly groupId: string | null;
}

/** All records of one kind, by onset; `landTimes` is sorted because the fall duration is constant. */
export interface KindTrack {
  readonly kind: ShapeKind;
  readonly recordIndices: readonly number[];
  readonly landTimes: readonly number[];
}

/** One chord: its notes' structures are linked by a light arc (requirement 1.3). */
export interface ChordGroup {
  readonly id: string;
  readonly label: string;
  readonly start: number;
  readonly end: number;
  /** When the last member has landed. */
  readonly landAt: number;
  readonly recordIndices: readonly number[];
}

export interface SpawnPlan {
  readonly seed: number;
  readonly durationSec: number;
  readonly records: readonly SpawnRecord[];
  readonly onsets: readonly number[];
  readonly tracks: readonly KindTrack[];
  readonly groups: readonly ChordGroup[];
  readonly kicks: readonly number[];
  readonly beats: readonly number[];
  readonly energy: { readonly times: readonly number[]; readonly values: readonly number[] };
  readonly staff: StaffPath;
  /** Voice lines in display order, with their height in metres (`main` first unless reordered). */
  readonly lines: readonly (StaffLine & { readonly offsetY: number })[];
  readonly budget: number;
  /** Records `[0, sceneryCount)` are template scenery (standing before the first note), the rest are notes. */
  readonly sceneryCount: number;
  readonly lookahead: number;
  readonly fallDuration: number;
  readonly template: WorldTemplate;
  /** Arrangement of the structures (viewer choice). */
  readonly layout: LayoutMode;
}

function clamp(v: number, lo: number, hi: number): number {
  return Math.min(hi, Math.max(lo, v));
}

export function staffUOf(midi: number): number {
  return clamp(staffUOfSnapped(midi), STAFF_U_MIN, STAFF_U_MAX);
}

/** Glyph by duration relative to the beat (requirement 3.4). */
export function glyphOf(durationSec: number, tempoBpm: number): GlyphKind {
  const beats = durationSec / (60 / Math.max(1, tempoBpm));
  if (beats >= QUARTER_MIN_BEATS) return 'quarter';
  if (beats >= EIGHTH_MIN_BEATS) return 'eighth';
  return 'sixteenth';
}

function heightFactor(note: NoteEvent, mapped: MappedNote, tempoBpm: number): number {
  switch (mapped.heightFrom) {
    case 'duration':
      return clamp(note.duration / ((60 / Math.max(1, tempoBpm)) * DURATION_FULL_BEATS), 0, 1);
    case 'pitch':
      return pitchFraction(note.midi, mapped.pitchRange);
    default:
      return clamp(note.velocity, 0, 1);
  }
}

function compareIds(a: string, b: string): number {
  return a < b ? -1 : a > b ? 1 : 0;
}

function byOnset(a: NoteEvent, b: NoteEvent): number {
  return a.time - b.time || a.midi - b.midi || compareIds(a.id, b.id);
}

function sortedUnique(values: readonly number[]): number[] {
  return [...new Set(values.filter(Number.isFinite))].sort((a, b) => a - b);
}

function kindSize(kind: ShapeKind, template: WorldTemplate): { base: number; extra: number } {
  if (!kind.startsWith('recipe:')) return KIND_HEIGHT[kind] ?? RECIPE_HEIGHT;
  const { heightScale } = recipeScale(template, kind);
  return { base: RECIPE_HEIGHT.base * heightScale, extra: RECIPE_HEIGHT.extra * heightScale };
}

/**
 * Template scenery as records that landed long before t = 0: same placement rule as a note (seeded, inside the zones of
 * its kind) with a random pitch column, so a new seed rearranges the whole scene. Pure, deterministic per seed.
 */
function sceneryRecords(
  template: WorldTemplate,
  seed: number,
  fallDuration: number,
  zonesOf: (kind: ShapeKind) => ZoneRect[],
  layout: LayoutMode,
): Omit<SpawnRecord, 'index' | 'slot'>[] {
  const records: Omit<SpawnRecord, 'index' | 'slot'>[] = [];
  let n = 0;
  for (const item of template.scenery) {
    for (let i = 0; i < item.count; i += 1, n += 1) {
      const id = `scenery:${n}:${item.kind}`;
      const rng = noteStream(seed, `${id}:attributes`);
      const midi = Math.floor(uniform(rng, PIANO_LOW_MIDI, PIANO_HIGH_MIDI));
      const velocity = uniform(rng, SCENERY_VELOCITY_MIN, SCENERY_VELOCITY_MAX);
      const size = kindSize(item.kind, template);
      records.push({
        noteId: id,
        stem: null,
        line: MAIN_LINE_ID,
        lineY: 0,
        colorHex: null,
        kind: item.kind,
        onset: SCENERY_LANDED_AT - fallDuration,
        duration: 0,
        velocity,
        midi,
        staffU: STAFF_U_MIN,
        glyph: 'quarter',
        landAt: SCENERY_LANDED_AT,
        growSec: MIN_GROW_SEC,
        target: placeNote(seed, id, midi, null, zonesOf(item.kind), layout),
        height: size.base + size.extra * rng(),
        emissive: EMISSIVE_BASE + EMISSIVE_VELOCITY_SCALE * velocity,
        colorRole: null,
        structureHex: null,
        colorT: rng(),
        groupId: null,
      });
    }
  }
  return records;
}

export function buildSpawnPlan(
  analysisIn: EngineAnalysis,
  template: WorldTemplate,
  seed: number,
  edits?: LayoutEdits,
  layout: LayoutMode = DEFAULT_LAYOUT,
): SpawnPlan {
  const edited = edits ? applyEdits(analysisIn, edits) : null;
  const analysis = edited ? edited.analysis : analysisIn;
  const staff = buildStaffPath(template);
  const lines = linesOf(edits ?? { version: 1, lines: [], notes: [], added: [] }).map((l) => ({
    ...l,
    offsetY: lineOffsetY(staff, l.id === MAIN_LINE_ID ? 0 : l.height),
  }));
  const offsetOf = new Map(lines.map((l) => [l.id, l.offsetY]));
  const lineColor = new Map(lines.flatMap((l) => (l.color ? [[l.id, l.color] as const] : [])));
  const { lookahead, fallDuration } = template.staff;
  const budget = template.budget.instancesPerKind;
  const notes = [...analysis.notes].sort(byOnset);
  const chordIds = new Set(analysis.chords.map((c) => c.id));
  const zoneCache = new Map<ShapeKind, ZoneRect[]>();
  const trackIndices = new Map<ShapeKind, number[]>();
  const zonesOf = (kind: ShapeKind): ZoneRect[] => {
    const cached = zoneCache.get(kind) ?? zonesFor(kind, template);
    zoneCache.set(kind, cached);
    return cached;
  };
  const claimSlot = (kind: ShapeKind, index: number): number => {
    const indices = trackIndices.get(kind) ?? [];
    trackIndices.set(kind, indices);
    const slot = indices.length % budget;
    indices.push(index);
    return slot;
  };

  const scenery = sceneryRecords(template, seed, fallDuration, zonesOf, layout).map(
    (r, index): SpawnRecord => ({ ...r, index, slot: claimSlot(r.kind, index) }),
  );
  const first = scenery.length;

  const noteRecords = notes.map((note, i): SpawnRecord => {
    const index = first + i;
    const line = edited?.lineOf.get(note.id) ?? MAIN_LINE_ID;
    const mapped = mapNote(note, template, line);
    const zones = zonesOf(mapped.kind);
    const slot = claimSlot(mapped.kind, index);
    const size = kindSize(mapped.kind, template);
    const velocity = clamp(note.velocity, 0, 1);
    return {
      index,
      noteId: note.id,
      stem: note.stem,
      line,
      lineY: offsetOf.get(line) ?? 0,
      colorHex: edited?.colorOf.get(note.id) ?? lineColor.get(line) ?? null,
      kind: mapped.kind,
      slot,
      onset: note.time,
      duration: note.duration,
      velocity,
      midi: note.midi,
      staffU: staffUOf(note.midi),
      glyph: glyphOf(note.duration, analysis.tempoBpm),
      landAt: note.time + fallDuration,
      growSec: Math.max(MIN_GROW_SEC, note.duration),
      target: placeNote(seed, note.id, note.midi, mapped.pitchRange, zones, layout),
      height: size.base + size.extra * heightFactor(note, mapped, analysis.tempoBpm),
      emissive: EMISSIVE_BASE + EMISSIVE_VELOCITY_SCALE * velocity,
      colorRole: mapped.colorRole === 'line' ? null : mapped.colorRole,
      structureHex: mapped.colorRole === 'line' ? (edited?.colorOf.get(note.id) ?? lineColor.get(line) ?? null) : null,
      colorT: pitchFraction(note.midi, mapped.pitchRange),
      groupId: note.chordId !== null && chordIds.has(note.chordId) ? note.chordId : null,
    };
  });
  const records = [...scenery, ...noteRecords];

  const tracks = [...trackIndices.entries()].map(([kind, recordIndices]) => ({
    kind,
    recordIndices,
    landTimes: recordIndices.map((i) => records[i]!.landAt),
  }));

  const membersByChord = new Map<string, number[]>();
  for (const r of records) {
    if (r.groupId === null) continue;
    const list = membersByChord.get(r.groupId) ?? [];
    list.push(r.index);
    membersByChord.set(r.groupId, list);
  }
  const groups = [...analysis.chords]
    .sort((a, b) => a.time - b.time || compareIds(a.id, b.id))
    .flatMap((chord): ChordGroup[] => {
      const members = membersByChord.get(chord.id) ?? [];
      if (members.length === 0) return [];
      return [
        {
          id: chord.id,
          label: chord.label,
          start: chord.time,
          end: chord.time + chord.duration,
          landAt: Math.max(...members.map((i) => records[i]!.landAt)),
          recordIndices: members,
        },
      ];
    });

  const drumOnsets = notes.filter((n) => n.stem === 'drums').map((n) => n.time);
  const energy = [...analysis.energy].sort((a, b) => a.time - b.time);
  return {
    seed,
    durationSec: analysis.durationSec,
    records,
    onsets: records.map((r) => r.onset),
    tracks,
    groups,
    // Kicks: drum-stem onsets when the analysis has drums, otherwise the beat grid.
    kicks: sortedUnique(drumOnsets.length > 0 ? drumOnsets : analysis.beats),
    beats: sortedUnique(analysis.beats),
    energy: { times: energy.map((e) => e.time), values: energy.map((e) => e.value) },
    staff,
    lines,
    budget,
    sceneryCount: first,
    lookahead,
    fallDuration,
    template,
    layout,
  };
}
