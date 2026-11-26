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
import { MOVING_KINDS } from './motion';
import { vehicleLanding } from './crowd';
import { buildRoads, clearOfRoads, templateHasRoads } from './roads';
import {
  BUILDING_VARIANT_HEIGHT,
  cityOf,
  worldSize,
  CONSTRUCTION_SEC,
  isCityKind,
    templateHasCity,
} from './city';
import { noteStream, uniform } from './prng';
import { layoutOf, reefKind, rotationOf, reefOf, reefSpot, themeOf, worldPlanKind } from './world-plan';
import { jitterHex, recipeScale, variantLook } from './recipe-scale';
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
  /** Rotation of a fixed object about the vertical axis (houses face their street), and its look (building variant). */
  readonly yaw: number;
  readonly variant: number;
  /**
   * City objects stand on spots of the city plan (`siteFrom` ≤ spot < `siteTo`, in the pool of their class). The first one
   * is `target` and the slot of the record; the others are built one after another around it, so the few hundred notes of
   * a song cover a whole town. Both are 0 outside a city.
   */
  readonly siteFrom: number;
  readonly siteTo: number;
  /** A rainbow note: whatever it touches blinks in rainbow colours (a seeded share of the notes). */
  readonly rainbow: boolean;
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
/** Half footprint of a fixed object, to keep it clear of the roads (plate metres). */
const FIXED_RADIUS: Readonly<Record<string, number>> = { terrain_ridge: 0.45, building: 0.25, tree: 0.28, conifer: 0.26, bush: 0.2, spike: 0.35, crystal: 0.15, cluster: 0.2 };

/** Where an object lands: the point, how it is turned, which building variant it is and a factor on its height. */
export interface Placed {
  readonly target: Vec3;
  readonly yaw: number;
  readonly variant: number;
  readonly heightMul: number;
  /** Minimum duration of the growth (a house is built over seconds, not over the length of a note). */
  readonly minGrowSec: number;
  readonly siteFrom: number;
  readonly siteTo: number;
}

type Placer = (kind: ShapeKind, at: () => Vec3) => Placed;

/** Where a fixed object really stands: its landing point pushed out of the roads, so a car never meets it (I38). */
function roadSettler(template: WorldTemplate, seed: number): (kind: ShapeKind, at: Vec3) => Vec3 {
  if (!templateHasRoads(template)) return (_kind, at) => at;
  const network = buildRoads(seed, worldSize(template));
  const half = worldSize(template) / 2;
  return (kind, at) => {
    if (MOVING_KINDS.has(kind)) return at;
    const radius = kind.startsWith('recipe:') ? recipeScale(template, kind).footprint / 2 : (FIXED_RADIUS[kind] ?? 0.25);
    const p = clearOfRoads(network, at.x, at.z, radius, half);
    return { x: p.x, y: at.y, z: p.z };
  };
}

/**
 * The placer of a plan. In a city template (I39) buildings, trees and bushes take the lots and gardens of the city plan,
 * ranked from the centre outwards so the music builds the town over the whole plate; everything else (and every other
 * template) keeps the zone placement. `totals` are the number of objects of each class, to spread them over the ranking.
 */
function placerFor(
  template: WorldTemplate,
  seed: number,
  totals: { building: number; garden: number; monument: number },
  themeTotals: ReadonlyMap<string, number> = new Map(),
): Placer {
  const settle = roadSettler(template, seed);
  const plain = (kind: ShapeKind, at: () => Vec3): Placed => ({ target: settle(kind, at()), yaw: 0, variant: 0, heightMul: 1, minGrowSec: 0, siteFrom: 0, siteTo: 0 });
  if (['reef', 'realm'].includes(worldPlanKind(template))) {
    // Seabed life grows in the patches of the reef plan (kelp forests, coral gardens, sandy flats, the wreck), from the centre out.
    const reef = reefOf(template, seed);
    const seenTheme = new Map<string, number>();
    const directed = layoutOf(template) !== null; // a layout fills each patch with the kinds of its steps
    return (kind, at) => {
      const theme = themeOf(kind);
      if (!theme) return plain(kind, at);
      const group = directed ? kind : theme;
      const ordinal = seenTheme.get(group) ?? 0;
      seenTheme.set(group, ordinal + 1);
      const spot = reefSpot(reef, kind, ordinal, themeTotals.get(group) ?? 1, seed, `${kind}:${ordinal}`);
      return { ...plain(kind, () => spot ?? at()), yaw: spot ? (ordinal * 2.399963) % (Math.PI * 2) : 0 };
    };
  }
  if (!templateHasCity(template)) return plain;
  const city = cityOf(template, seed);
  const seen = { building: 0, garden: 0, monument: 0 };
  const pools = { building: city.lots, garden: city.gardens, monument: city.monuments } as const;
  return (kind, at) => {
    const cls = isCityKind(kind);
    if (cls === null) return plain(kind, at);
    const pool = pools[cls];
    if (pool.length === 0) return plain(kind, at);
    const ordinal = seen[cls];
    seen[cls] += 1;
    const total = Math.max(1, totals[cls]);
    // Fewer objects than spots: each owns a share of the ranking (built one after another); more: spots are reused.
    const from = total < pool.length ? Math.floor((ordinal * pool.length) / total) : ordinal % pool.length;
    const to = total < pool.length ? Math.max(from + 1, Math.floor(((ordinal + 1) * pool.length) / total)) : from + 1;
    const spot = pool[from]!;
    const lot = cls === 'building' ? (spot as (typeof city.lots)[number]) : null;
    return {
      target: { x: spot.x, y: 0, z: spot.z },
      yaw: lot ? lot.yaw : 0,
      variant: lot ? lot.variant : 0,
      heightMul: lot ? (BUILDING_VARIANT_HEIGHT[lot.variant] ?? 1) : 1,
      minGrowSec: cls === 'building' ? CONSTRUCTION_SEC : 0,
      siteFrom: from,
      siteTo: to,
    };
  };
}

/** Kinds that the plan of a city decides (the notes do not): they are built where the plan says. */
const PLAN_KINDS: ReadonlySet<string> = new Set(['building', 'tree', 'conifer', 'bush', 'car', 'bicycle']);
/** What a falling note becomes where it lands on the plan: building on a lot, tree or bush in a garden, car on a road. */
const PLAN_MIX: readonly (readonly [ShapeKind, number])[] = [
  ['building', 0.3],
  ['tree', 0.2],
  ['conifer', 0.08],
  ['bush', 0.14],
  ['car', 0.25],
  ['bicycle', 0.03],
];
/** Share of the notes that are rainbow notes. */
const RAINBOW_SHARE = 0.14;

function plannedKind(template: WorldTemplate, seed: number, noteId: string, mapped: ShapeKind, index: number): ShapeKind {
  if (!PLAN_KINDS.has(mapped)) return mapped; // clouds, planes, needles and hills keep their rule
  // The director's mix, in order, when it wrote one for this city (kinds the plan places only).
  const rotation = rotationOf(template)?.filter((k) => PLAN_KINDS.has(k));
  if (rotation && rotation.length > 0) return rotation[index % rotation.length]!;
  const u = noteStream(seed, `${noteId}:plan`)();
  let acc = 0;
  for (const [kind, weight] of PLAN_MIX) {
    acc += weight;
    if (u < acc) return kind;
  }
  return 'bush';
}

function sceneryRecords(
  template: WorldTemplate,
  seed: number,
  fallDuration: number,
  zonesOf: (kind: ShapeKind) => ZoneRect[],
  layout: LayoutMode,
  place: Placer,
): Omit<SpawnRecord, 'index' | 'slot'>[] {
  const records: Omit<SpawnRecord, 'index' | 'slot'>[] = [];
  let n = 0;
  for (const item of template.scenery) {
    if (templateHasCity(template) && PLAN_KINDS.has(item.kind)) continue; // a city starts empty: the notes build it
    for (let i = 0; i < item.count; i += 1, n += 1) {
      const id = `scenery:${n}:${item.kind}`;
      const rng = noteStream(seed, `${id}:attributes`);
      const midi = Math.floor(uniform(rng, PIANO_LOW_MIDI, PIANO_HIGH_MIDI));
      const velocity = uniform(rng, SCENERY_VELOCITY_MIN, SCENERY_VELOCITY_MAX);
      const size = kindSize(item.kind, template);
      const placed = place(item.kind, () => placeNote(seed, id, midi, null, zonesOf(item.kind), layout));
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
        growSec: Math.max(MIN_GROW_SEC, placed.minGrowSec),
        target: placed.target,
        yaw: placed.yaw,
        variant: placed.variant,
        siteFrom: placed.siteFrom,
        siteTo: placed.siteTo,
        rainbow: false,
        height: (size.base + size.extra * rng()) * placed.heightMul,
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

/** Objects a creator placed by hand (map creator): fixed scenery with their own position, yaw, scale and variant. */
function placedRecords(template: WorldTemplate, fallDuration: number): Omit<SpawnRecord, 'index' | 'slot'>[] {
  return (template.layout?.placed ?? []).map((o) => {
    const size = kindSize(o.kind, template);
    const look = variantLook(template, o.kind, o.variant);
    const unit = noteStream(template.layout?.seed ?? 0, `jitter:${o.id}`)() * 2 - 1;
    return {
      noteId: `scenery:placed:${o.id}`,
      stem: null,
      line: MAIN_LINE_ID,
      lineY: 0,
      colorHex: o.color === null ? null : jitterHex(o.color, look.jitter, unit),
      kind: o.kind,
      onset: SCENERY_LANDED_AT - fallDuration,
      duration: 0,
      velocity: 0.5,
      midi: Math.floor((PIANO_LOW_MIDI + PIANO_HIGH_MIDI) / 2),
      staffU: STAFF_U_MIN,
      glyph: 'quarter',
      landAt: SCENERY_LANDED_AT,
      growSec: MIN_GROW_SEC,
      target: { x: o.x, y: o.y, z: o.z },
      yaw: (o.yaw * Math.PI) / 180,
      variant: o.variant,
      siteFrom: 0,
      siteTo: 0,
      rainbow: false,
      height: (size.base + size.extra * 0.5) * o.scale * look.height,
      emissive: EMISSIVE_BASE + EMISSIVE_VELOCITY_SCALE * 0.5,
      colorRole: null,
      structureHex: null,
      colorT: 0.5,
      groupId: null,
    } satisfies Omit<SpawnRecord, 'index' | 'slot'>;
  });
}

export function buildSpawnPlan(
  analysisIn: EngineAnalysis,
  template: WorldTemplate,
  seedIn: number,
  edits?: LayoutEdits,
  layout: LayoutMode = DEFAULT_LAYOUT,
): SpawnPlan {
  const seed = template.layout?.seed ?? seedIn; // a map made by hand keeps its own seed
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
  const totals = { building: 0, garden: 0, monument: 0 };
  const count = (kind: ShapeKind, n: number): void => {
    const cls = isCityKind(kind);
    if (cls !== null) totals[cls] += n;
  };
  const cityMode = templateHasCity(template);
  const reefMode = ['reef', 'realm'].includes(worldPlanKind(template));
  const kindOf = (note: NoteEvent, mapped: ShapeKind, index: number): ShapeKind =>
    cityMode ? plannedKind(template, seed, note.id, mapped, index) : reefMode ? reefKind(template, seed, note.id, mapped, index) : mapped;
  const themeTotals = new Map<string, number>();
  const countTheme = (kind: ShapeKind, n: number): void => {
    const theme = themeOf(kind);
    if (!theme) return;
    themeTotals.set(theme, (themeTotals.get(theme) ?? 0) + n);
    themeTotals.set(kind, (themeTotals.get(kind) ?? 0) + n); // the director's layout fills patches kind by kind
  };
  if (reefMode) for (const item of template.scenery) countTheme(item.kind, item.count);
  for (const item of template.scenery) if (!(cityMode && PLAN_KINDS.has(item.kind))) count(item.kind, item.count);
  for (const [i, note] of notes.entries()) {
    const planned = kindOf(note, mapNote(note, template, edited?.lineOf.get(note.id) ?? MAIN_LINE_ID).kind, i);
    count(planned, 1);
    if (reefMode) countTheme(planned, 1);
  }
  const claimSlot = (kind: ShapeKind, index: number): number => {
    const indices = trackIndices.get(kind) ?? [];
    trackIndices.set(kind, indices);
    const slot = indices.length % budget;
    indices.push(index);
    return slot;
  };

  const place = placerFor(template, seed, totals, themeTotals);
  /** A city object takes the slot of its first spot (spots are unique, so are slots); the others the next free slot. */
  const slotOf = (r: { siteFrom: number; siteTo: number }, claimed: number): number => (r.siteTo > r.siteFrom ? r.siteFrom : claimed);
  const scenery = [...sceneryRecords(template, seed, fallDuration, zonesOf, layout, place), ...placedRecords(template, fallDuration)].map(
    (r, index): SpawnRecord => ({ ...r, index, slot: slotOf(r, claimSlot(r.kind, index)) }),
  );
  const first = scenery.length;

  const noteRecords = notes.map((note, i): SpawnRecord => {
    const index = first + i;
    const line = edited?.lineOf.get(note.id) ?? MAIN_LINE_ID;
    const mapped0 = mapNote(note, template, line);
    const mapped: MappedNote = { ...mapped0, kind: kindOf(note, mapped0.kind, i) };
    const zones = zonesOf(mapped.kind);
    const size = kindSize(mapped.kind, template);
    const velocity = clamp(note.velocity, 0, 1);
    const placed = place(mapped.kind, () => placeNote(seed, note.id, note.midi, mapped.pitchRange, zones, layout));
    const slot = slotOf(placed, claimSlot(mapped.kind, index));
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
      growSec: Math.max(MIN_GROW_SEC, note.duration, placed.minGrowSec),
      target: placed.target,
      yaw: placed.yaw,
      variant: placed.variant,
      siteFrom: placed.siteFrom,
      siteTo: placed.siteTo,
      rainbow: noteStream(seed, `${note.id}:rainbow`)() < RAINBOW_SHARE,
      height: (size.base + size.extra * heightFactor(note, mapped, analysis.tempoBpm)) * placed.heightMul,
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
  const plan: SpawnPlan = {
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
  // A vehicle lands on its road and drives off from there: its target is where its lane is when it lands.
  const landed = [...records];
  let moved = false;
  for (const track of tracks) {
    if (track.kind !== 'car' && track.kind !== 'bicycle') continue;
    track.recordIndices.forEach((recordIndex, k) => {
      const r = landed[recordIndex]!;
      const spot = vehicleLanding(plan, track.kind, k, r.landAt);
      if (!spot) return;
      landed[recordIndex] = { ...r, target: { x: spot.x, y: 0, z: spot.z } };
      moved = true;
    });
  }
  return moved ? { ...plan, records: landed } : plan;
}
