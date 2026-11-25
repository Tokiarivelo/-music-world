/**
 * Aurora sky notes (viewer mode "northern lights"): every note of a window around the playhead floats in the sky as a
 * light orb on one of three aurora curtains, so a paused song shows its notes like an aurora over the plate and each
 * note can be picked (click, tap, VR ray). Pure: a position depends only on (plan, record, t), so a seek gives the same
 * picture as playing. Plate frame as in `layout.ts`.
 */
import { AURORA_GAP_FACTOR, AURORA_HEIGHT_RATIO, PIANO_HIGH_MIDI, PIANO_LOW_MIDI, STAFF_LINE_GAP_RATIO } from './constants';
import { hashSeed } from './prng';
import type { SpawnPlan, SpawnRecord } from './spawn-plan';
import { staffPoint, type StaffPath } from './staff';
import type { Vec3 } from './types';

/** Seconds of already played notes that stay in the sky (fading), and the minimum look-ahead window. */
export const SKY_PAST_SEC = 5;
export const SKY_FUTURE_MIN_SEC = 8;
/** Curtain height in staff line gaps, number of curtains and their lateral spacing in line gaps. */
export const SKY_HEIGHT_GAPS = 14;
export const SKY_CURTAINS = 3;
export const SKY_CURTAIN_SPACING_GAPS = 3.2;
/** Notes keep clear of both ends of the curtain (fraction of the path). */
const SKY_U_MIN = 0.03;
const SKY_U_MAX = 0.97;

export interface SkyNote {
  readonly index: number;
  readonly position: Vec3;
  /** 0 (about to vanish) to 1 (sounding now). */
  readonly glow: number;
  /** Curtain the note hangs on, 0 to `SKY_CURTAINS - 1`. */
  readonly curtain: number;
  /** True while the note sounds (onset ≤ t < onset + duration). */
  readonly sounding: boolean;
}

/**
 * The path the sky hangs on: the staff path lifted to the aurora height (templates with a low staff get the same high
 * sky) with the roomy aurora line gap, so every template shows the same northern lights.
 */
export function skyPath(plan: Pick<SpawnPlan, 'staff' | 'template'>): StaffPath {
  const size = plan.template.terrain.size;
  const baseY = Math.max(plan.staff.baseY, size * AURORA_HEIGHT_RATIO);
  const lift = (p: Vec3): Vec3 => ({ x: p.x, y: baseY, z: p.z });
  return {
    ...plan.staff,
    start: lift(plan.staff.start),
    control: lift(plan.staff.control),
    end: lift(plan.staff.end),
    baseY,
    lineGap: Math.max(plan.staff.lineGap, size * STAFF_LINE_GAP_RATIO * AURORA_GAP_FACTOR),
  };
}

/** Window length in seconds ahead of the playhead. */
export function skyFutureSec(plan: Pick<SpawnPlan, 'lookahead'>): number {
  return Math.max(SKY_FUTURE_MIN_SEC, plan.lookahead);
}

function clamp01(v: number): number {
  return Math.min(1, Math.max(0, v));
}

function hash01(seed: number, noteId: string, salt: string): number {
  return (hashSeed(seed, `${noteId}:${salt}`) >>> 0) / 4294967296;
}

/** Sky position of one record at time t; the horizontal axis is the song time, the height is the pitch. */
export function skyPosition(plan: SpawnPlan, r: SpawnRecord, t: number): { position: Vec3; curtain: number } {
  const future = skyFutureSec(plan);
  const along = clamp01((r.onset - t + SKY_PAST_SEC) / (SKY_PAST_SEC + future));
  const u = SKY_U_MIN + (SKY_U_MAX - SKY_U_MIN) * along;
  const path = skyPath(plan);
  const base = staffPoint(path, u);
  const a = staffPoint(path, Math.max(0, u - 0.01));
  const b = staffPoint(path, Math.min(1, u + 0.01));
  const len = Math.hypot(b.x - a.x, b.z - a.z) || 1;
  const nx = -(b.z - a.z) / len;
  const nz = (b.x - a.x) / len;
  const curtain = Math.min(SKY_CURTAINS - 1, Math.floor(hash01(plan.seed, r.noteId, 'curtain') * SKY_CURTAINS));
  const side = (curtain - (SKY_CURTAINS - 1) / 2) * SKY_CURTAIN_SPACING_GAPS * path.lineGap;
  const pitch = clamp01((r.midi - PIANO_LOW_MIDI) / (PIANO_HIGH_MIDI - PIANO_LOW_MIDI));
  const phase = hash01(plan.seed, r.noteId, 'bob') * Math.PI * 2;
  const bob = Math.sin(t * 0.6 + phase) * path.lineGap * 0.35;
  const sway = Math.sin(t * 0.35 + phase * 1.7) * path.lineGap * 0.5;
  return {
    curtain,
    position: {
      x: base.x + nx * (side + sway),
      y: base.y + path.lineGap * SKY_HEIGHT_GAPS * (0.08 + 0.84 * pitch) + bob,
      z: base.z + nz * (side + sway),
    },
  };
}

/** Notes visible in the aurora sky at t, by onset. A record with `onset` in [t - past, t + future) is in the window. */
export function skyNotesAt(plan: SpawnPlan, t: number, lowerBound: (v: readonly number[], x: number) => number): SkyNote[] {
  const { records, onsets } = plan;
  const future = skyFutureSec(plan);
  const out: SkyNote[] = [];
  const end = lowerBound(onsets, t + future);
  for (let i = lowerBound(onsets, t - SKY_PAST_SEC); i < end; i += 1) {
    const r = records[i]!;
    if (r.noteId.startsWith('scenery:')) continue; // template scenery is not a note
    const { position, curtain } = skyPosition(plan, r, t);
    const sounding = t >= r.onset && t < r.onset + Math.max(r.duration, 0.05);
    const dt = r.onset - t;
    const glow = sounding ? 1 : dt > 0 ? 0.55 + 0.35 * (1 - dt / future) : clamp01(1 - -dt / SKY_PAST_SEC) * 0.8;
    out.push({ index: i, position, glow, curtain, sounding });
  }
  return out;
}
