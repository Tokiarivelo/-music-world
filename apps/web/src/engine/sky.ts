/**
 * Aurora sky notes (viewer mode "northern lights"): every note of a window around the playhead floats in the sky as a
 * light orb on one of three aurora curtains, so a paused song shows its notes like an aurora over the plate and each
 * note can be picked (click, tap, VR ray). Pure: a position depends only on (plan, record, t), so a seek gives the same
 * picture as playing. Plate frame as in `layout.ts`.
 */
import { Color } from 'three';
import { AURORA_GAP_FACTOR, PIANO_HIGH_MIDI, PIANO_LOW_MIDI, STAFF_LINE_GAP_RATIO } from './constants';
import { hashSeed } from './prng';
import { rainSway } from './rain';
import type { SpawnPlan, SpawnRecord } from './spawn-plan';
import type { StaffPath } from './staff';
import type { Vec3 } from './types';

/** Seconds of already played notes that stay in the sky (fading), and the minimum look-ahead window. */
export const SKY_PAST_SEC = 5;
export const SKY_FUTURE_MIN_SEC = 8;
/**
 * Height of the celestial aurora curtains and notes in the sky, as a multiple of the terrain size.
 * Positioned high in the celestial vault above the plate, buildings and clouds, so notes glitter across
 * the night sky at any camera view and never block the city or ground scenes below.
 */
export const SKY_AURORA_HEIGHT_RATIO = 1.15;

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
 * The path the sky hangs on: a majestic celestial arc sweeping across the sky dome high above the plate,
 * with the roomy aurora line gap, so every template shows notes floating in the northern lights in the sky.
 */
export function skyPath(plan: Pick<SpawnPlan, 'staff' | 'template'>): StaffPath {
  const size = plan.template.terrain.size;
  const baseY = Math.max(plan.staff.baseY * 3, size * SKY_AURORA_HEIGHT_RATIO);
  return {
    ...plan.staff,
    start: { x: -size * 1.6, y: baseY, z: size * 0.7 },
    control: { x: 0, y: baseY * 1.15, z: -size * 1.0 },
    end: { x: size * 1.6, y: baseY, z: size * 0.5 },
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

/** Pitch of a note over the piano range, 0..1: its height in the aurora and its color. */
export function skyPitch(midi: number): number {
  return clamp01((midi - PIANO_LOW_MIDI) / (PIANO_HIGH_MIDI - PIANO_LOW_MIDI));
}

/** Height of a note in its curtain as a fraction of the curtain's height. */
export function skyHeightFraction(midi: number): number {
  return 0.08 + 0.84 * skyPitch(midi);
}

function hash01(seed: number, noteId: string, salt: string): number {
  return (hashSeed(seed, `${noteId}:${salt}`) >>> 0) / 4294967296;
}

/** Position along the sky path (0..1) of a record at time t: the horizontal axis of the sky is the song time. */
export function skyU(plan: SpawnPlan, r: SpawnRecord, t: number): number {
  const along = clamp01((r.onset - t + SKY_PAST_SEC) / (SKY_PAST_SEC + skyFutureSec(plan)));
  return SKY_U_MIN + (SKY_U_MAX - SKY_U_MIN) * along;
}

/** Sky position of one record at time t in the circular mountain horizon. */
export function skyPosition(plan: SpawnPlan, r: SpawnRecord, t: number): { position: Vec3; curtain: number } {
  const size = plan.template.terrain.size;
  // Circular placement along the horizon of the mountains that surround the world
  const targetDist = Math.hypot(r.target.x, r.target.z);
  const baseAngle = targetDist > 0.01 ? Math.atan2(r.target.z, r.target.x) : (hash01(plan.seed, r.noteId, 'ang') * Math.PI * 2);
  const spread = (hash01(plan.seed, r.noteId, 'spr') - 0.5) * 0.45;
  const angle = baseAngle + spread;

  // Mountain horizon radius: placing notes on the ridges of the mountains encircling the world
  const radVar = (hash01(plan.seed, r.noteId, 'rad') - 0.5) * 0.25;
  const radius = size * (1.75 + radVar);

  // Height along the mountain horizon: resting gently in the aurora band right above the crests
  // Guaranteed >= plan.staff.baseY to keep invariant
  const minBaseY = Math.max(plan.staff.baseY, size * 0.28);
  const pitchH = size * 0.16 * skyPitch(r.midi);
  const phase = hash01(plan.seed, r.noteId, 'bob') * Math.PI * 2;
  const bob = Math.sin(t * 0.7 + phase) * size * 0.02;
  const y = Math.max(plan.staff.baseY, minBaseY + pitchH + bob);

  const curtain = Math.min(SKY_CURTAINS - 1, Math.floor(hash01(plan.seed, r.noteId, 'curtain') * SKY_CURTAINS));

  return {
    curtain,
    position: {
      x: Math.cos(angle) * radius,
      y,
      z: Math.sin(angle) * radius,
    },
  };
}

/**
 * Trajectory of a note descending from the mountain horizon to its target on the scene.
 * As music plays, each note at onset swoops gracefully down from the mountains to plant into the ground.
 */
export function auroraDescentPosition(
  horizon: Vec3,
  target: Vec3,
  noteHash: number,
  progress: number,
  plateSize: number,
): Vec3 {
  const p = Math.min(1, Math.max(0, progress));
  const pXZ = p * p * (3 - 2 * p);
  const pY = Math.pow(p, 1.35);
  const sway = rainSway(noteHash, p, plateSize * 0.3);
  return {
    x: horizon.x + (target.x - horizon.x) * pXZ + sway.dx,
    y: horizon.y + (target.y - horizon.y) * pY,
    z: horizon.z + (target.z - horizon.z) * pXZ + sway.dz,
  };
}

/**
 * Multi-color rainbow hex for a descending note.
 * Radiates vibrant rainbow hues (arc-en-ciel) as the note swoops down to give life to objects.
 */
/**
 * Multi-color rainbow hex for a descending note.
 * Harmonizes with the initial analyzed note color and blooms into vibrant rainbow hues (arc-en-ciel)
 * as the note swoops down to give life to the planted object.
 */
export function rainbowHex(progress: number, t: number, midi: number, baseHex?: string | null): string {
  const hue = ((progress * 1.5 + t * 0.8 + (midi % 12) / 12) % 1 + 1) % 1;
  const rainbow = new Color().setHSL(hue, 1.0, 0.65);
  if (baseHex) {
    const base = new Color(baseHex);
    return `#${base.lerp(rainbow, Math.min(1, progress * 1.4)).getHexString()}`;
  }
  return `#${rainbow.getHexString()}`;
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
