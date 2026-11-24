/**
 * `worldStateAt(plan, t)` (requirements 2.1–2.4, 3.2, 3.3, 3.5): the whole visible world at song time `t`, computed
 * only from the plan and `t` — no frame history, so pause, resume and seek are exact by construction.
 *
 * Phases of a note, from `t - onset`:
 *   onStaff  onset - lookahead < t < onset   slides from the far end of the staff (u = 1) to the playhead
 *   falling  onset ≤ t < landAt              falls from the playhead to its target on the plate
 *   growing  landAt ≤ t < landAt + growSec   structure grows (height × growth)
 *   alive    afterwards                      until its slot is reused by a newer note of the same kind
 */
import { ARC_FADE_SEC, FALL_ARC_HEIGHT, PULSE_DECAY_SEC } from './constants';
import { hashSeed } from './prng';
import { rainPosition } from './rain';
import type { SpawnPlan, SpawnRecord } from './spawn-plan';
import { staffNotePosition } from './staff';
import type { ColorRole, GlyphKind, ShapeKind, Vec3 } from './types';

export interface NoteOnStaff {
  readonly index: number;
  readonly glyph: GlyphKind;
  /** Position along the staff (1 = far end, playhead at `plan.staff.playheadU`). */
  readonly u: number;
  readonly position: Vec3;
}

export interface FallingNote {
  readonly index: number;
  readonly glyph: GlyphKind;
  /** 0 at onset, 1 at landing. */
  readonly progress: number;
  readonly position: Vec3;
}

export interface StructureState {
  readonly index: number;
  readonly kind: ShapeKind;
  readonly slot: number;
  readonly phase: 'growing' | 'alive';
  /** Smoothstep of the growth time, in [0, 1]. */
  readonly growth: number;
  readonly position: Vec3;
  readonly height: number;
  readonly emissive: number;
  readonly colorRole: ColorRole | null;
  readonly colorT: number;
}

export interface ArcState {
  readonly groupId: string;
  readonly from: Vec3;
  readonly to: Vec3;
  /** Fade in after the last member lands, fade out after the chord ends. */
  readonly intensity: number;
}

export interface Pulses {
  /** 1 at a kick onset, decaying exponentially; 0 before the first kick. */
  readonly kick: number;
  readonly beat: number;
  /** Song energy (0–1), linearly interpolated. */
  readonly energy: number;
}

export interface WorldState {
  readonly t: number;
  readonly notesOnStaff: readonly NoteOnStaff[];
  readonly fallingNotes: readonly FallingNote[];
  /** Live structures, grouped by kind; at most `plan.budget` per kind, distinct slots. */
  readonly structures: readonly StructureState[];
  /** Number of notes that have landed so far (non-decreasing in t, requirement 2.3). */
  readonly spawnedCount: number;
  readonly arcs: readonly ArcState[];
  readonly pulses: Pulses;
}

/** First index whose value is > x (values sorted ascending). */
export function upperBound(values: readonly number[], x: number): number {
  let lo = 0;
  let hi = values.length;
  while (lo < hi) {
    const mid = (lo + hi) >>> 1;
    if (values[mid]! <= x) lo = mid + 1;
    else hi = mid;
  }
  return lo;
}

/** First index whose value is ≥ x. */
export function lowerBound(values: readonly number[], x: number): number {
  let lo = 0;
  let hi = values.length;
  while (lo < hi) {
    const mid = (lo + hi) >>> 1;
    if (values[mid]! < x) lo = mid + 1;
    else hi = mid;
  }
  return lo;
}

function clamp01(v: number): number {
  return Math.min(1, Math.max(0, v));
}

function smoothstep(x: number): number {
  const c = clamp01(x);
  return c * c * (3 - 2 * c);
}

function decayFrom(times: readonly number[], t: number): number {
  const i = upperBound(times, t) - 1;
  if (i < 0) return 0;
  return Math.exp(-(t - times[i]!) / PULSE_DECAY_SEC);
}

function energyAt(times: readonly number[], values: readonly number[], t: number): number {
  if (times.length === 0) return 0;
  const i = upperBound(times, t);
  if (i === 0) return values[0]!;
  if (i >= times.length) return values[times.length - 1]!;
  const t0 = times[i - 1]!;
  const t1 = times[i]!;
  const w = t1 > t0 ? (t - t0) / (t1 - t0) : 0;
  return values[i - 1]! + (values[i]! - values[i - 1]!) * w;
}

function fallPosition(plan: SpawnPlan, r: SpawnRecord, progress: number): Vec3 {
  const from = staffNotePosition(plan.staff, plan.staff.playheadU, r.staffU, r.lineY);
  if (plan.template.staff.style === 'aurora') {
    return rainPosition(from, r.target, hashSeed(plan.seed, r.noteId), progress, plan.template.terrain.size);
  }
  const lift = FALL_ARC_HEIGHT * 4 * progress * (1 - progress);
  return {
    x: from.x + (r.target.x - from.x) * progress,
    y: from.y + (r.target.y - from.y) * progress + lift,
    z: from.z + (r.target.z - from.z) * progress,
  };
}

export function worldStateAt(plan: SpawnPlan, t: number): WorldState {
  if (!Number.isFinite(t)) throw new RangeError(`worldStateAt: not a finite time: ${t}`);
  const { records, onsets, staff, lookahead, fallDuration } = plan;

  const notesOnStaff: NoteOnStaff[] = [];
  const staffEnd = upperBound(onsets, t + lookahead);
  for (let i = upperBound(onsets, t); i < staffEnd; i++) {
    const r = records[i]!;
    const ahead = (r.onset - t) / lookahead; // (0, 1]
    if (ahead >= 1) continue; // appears strictly after onset - lookahead
    const u = staff.playheadU + ahead * (1 - staff.playheadU);
    notesOnStaff.push({ index: i, glyph: r.glyph, u, position: staffNotePosition(staff, u, r.staffU, r.lineY) });
  }

  const fallingNotes: FallingNote[] = [];
  const fallEnd = upperBound(onsets, t);
  for (let i = upperBound(onsets, t - fallDuration); i < fallEnd; i++) {
    const r = records[i]!;
    if (r.landAt <= t) continue; // floating-point edge: already landed
    const progress = clamp01((t - r.onset) / fallDuration);
    fallingNotes.push({ index: i, glyph: r.glyph, progress, position: fallPosition(plan, r, progress) });
  }

  const structures: StructureState[] = [];
  let spawnedCount = 0;
  for (const track of plan.tracks) {
    const landed = upperBound(track.landTimes, t);
    spawnedCount += landed;
    // Slot = k % budget: the last `budget` landed records of a kind occupy distinct slots (oldest overwritten).
    for (let k = Math.max(0, landed - plan.budget); k < landed; k++) {
      const r = records[track.recordIndices[k]!]!;
      const elapsed = t - r.landAt;
      const growth = smoothstep(elapsed / r.growSec);
      structures.push({
        index: r.index,
        kind: r.kind,
        slot: r.slot,
        phase: elapsed < r.growSec ? 'growing' : 'alive',
        growth,
        position: r.target,
        height: r.height * growth,
        emissive: r.emissive,
        colorRole: r.colorRole,
        colorT: r.colorT,
      });
    }
  }

  const arcs: ArcState[] = [];
  if (plan.template.fx.chordLinks !== 'none') {
    for (const g of plan.groups) {
      if (g.landAt > t || t >= Math.max(g.end, g.landAt) + ARC_FADE_SEC) continue;
      const fadeIn = clamp01((t - g.landAt) / ARC_FADE_SEC);
      const fadeOut = t > g.end ? clamp01(1 - (t - Math.max(g.end, g.landAt)) / ARC_FADE_SEC) : 1;
      const intensity = Math.min(fadeIn, fadeOut);
      for (let m = 1; m < g.recordIndices.length; m++) {
        const from = records[g.recordIndices[m - 1]!]!.target;
        const to = records[g.recordIndices[m]!]!.target;
        arcs.push({ groupId: g.id, from, to, intensity });
      }
    }
  }

  return {
    t,
    notesOnStaff,
    fallingNotes,
    structures,
    spawnedCount: Math.max(0, spawnedCount - plan.sceneryCount),
    arcs,
    pulses: {
      kick: plan.template.fx.beatPulse ? decayFrom(plan.kicks, t) : 0,
      beat: decayFrom(plan.beats, t),
      energy: energyAt(plan.energy.times, plan.energy.values, t),
    },
  };
}
