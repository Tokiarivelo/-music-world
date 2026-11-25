/**
 * Weather of the infinite world (pure): `weatherAt(plan, t, mode)` reads the song, never the clock, so a seek gives the
 * same sky as playing. Algorithms read the music, the views only draw the numbers (data-only, no LLM in the loop):
 *   gloom      minor chords nearby and a quiet passage        → clouds, then rain
 *   violence   loud passage in a minor key                    → storm, lightning on the drum hits
 *   serenity   major chords, clear sky                        → sun, birds
 * A viewer mode overrides the music (`clear`, `cloudy`, `rain`, `storm`); `auto` follows it.
 */
import { hashSeed } from './prng';
import type { SpawnPlan } from './spawn-plan';
import { lowerBound, upperBound } from './world-state';

export const WEATHER_MODES = ['auto', 'clear', 'cloudy', 'rain', 'storm'] as const;
export type WeatherMode = (typeof WEATHER_MODES)[number];
export const DEFAULT_WEATHER: WeatherMode = 'auto';

export function isWeatherMode(value: unknown): value is WeatherMode {
  return typeof value === 'string' && (WEATHER_MODES as readonly string[]).includes(value);
}

export interface Weather {
  /** All in [0, 1]. */
  readonly cloudCover: number;
  readonly rain: number;
  readonly storm: number;
  /** Lightning brightness: decays after a drum hit chosen by the seed, 0 outside a storm. */
  readonly flash: number;
  /** Seed-stable id of the current lightning strike (changes the bolt's place), -1 when none. */
  readonly strike: number;
  readonly sun: number;
  readonly birds: number;
  readonly wind: number;
}

/** Seconds of music read around t for the mood, and the decay of a lightning flash. */
export const WEATHER_WINDOW_SEC = 10;
export const FLASH_DECAY_SEC = 0.22;
/** A drum hit becomes a lightning strike with this probability (seeded) while a storm rages. */
export const STRIKE_SHARE = 0.4;

const clamp01 = (v: number): number => Math.min(1, Math.max(0, v));
const smooth = (a: number, b: number, x: number): number => {
  const c = clamp01((x - a) / (b - a));
  return c * c * (3 - 2 * c);
};

/** Chord labels like `Am`, `F#m7`, `Dm`: minor unless `maj`, `M` or no `m` after the root. */
export function isMinorChord(label: string): boolean {
  return /^[A-G][#b]?m(?!aj)/.test(label.trim());
}

function energyMean(plan: SpawnPlan, t: number): number {
  const { times, values } = plan.energy;
  if (times.length === 0) return 0.4;
  const lo = lowerBound(times, t - WEATHER_WINDOW_SEC / 2);
  const hi = upperBound(times, t + WEATHER_WINDOW_SEC / 2);
  if (hi <= lo) return clamp01(values[Math.min(values.length - 1, Math.max(0, lo - 1))] ?? 0.4);
  let sum = 0;
  for (let i = lo; i < hi; i += 1) sum += values[i]!;
  return clamp01(sum / (hi - lo));
}

function minorShare(plan: SpawnPlan, t: number): number {
  let minor = 0;
  let total = 0;
  for (const g of plan.groups) {
    if (g.end < t - WEATHER_WINDOW_SEC || g.start > t + WEATHER_WINDOW_SEC) continue;
    total += 1;
    if (isMinorChord(g.label)) minor += 1;
  }
  return total === 0 ? 0.4 : minor / total;
}

const FIXED: Record<Exclude<WeatherMode, 'auto'>, Omit<Weather, 'flash' | 'strike'>> = {
  clear: { cloudCover: 0.08, rain: 0, storm: 0, sun: 1, birds: 1, wind: 0.25 },
  cloudy: { cloudCover: 0.85, rain: 0, storm: 0, sun: 0.15, birds: 0.2, wind: 0.4 },
  rain: { cloudCover: 0.95, rain: 0.8, storm: 0, sun: 0, birds: 0, wind: 0.5 },
  storm: { cloudCover: 1, rain: 1, storm: 1, sun: 0, birds: 0, wind: 0.95 },
};

function lightning(plan: SpawnPlan, t: number, storm: number): { flash: number; strike: number } {
  if (storm < 0.3 || plan.kicks.length === 0) return { flash: 0, strike: -1 };
  // The latest strike-worthy drum hit within one second before t.
  let i = upperBound(plan.kicks, t) - 1;
  for (let guard = 0; i >= 0 && guard < 8; i -= 1, guard += 1) {
    const hit = plan.kicks[i]!;
    if (t - hit > 1) break;
    const roll = (hashSeed(plan.seed, `strike:${i}`) >>> 0) / 4294967296;
    if (roll < STRIKE_SHARE * storm) return { flash: storm * Math.exp(-(t - hit) / FLASH_DECAY_SEC), strike: i };
  }
  return { flash: 0, strike: -1 };
}

export function weatherAt(plan: SpawnPlan, t: number, mode: WeatherMode = DEFAULT_WEATHER): Weather {
  if (!Number.isFinite(t)) throw new RangeError(`weatherAt: not a finite time: ${t}`);
  if (mode !== 'auto') {
    const w = FIXED[mode];
    return { ...w, ...lightning(plan, t, w.storm) };
  }
  const e = energyMean(plan, t);
  const minor = minorShare(plan, t);
  const gloom = 0.6 * minor + 0.4 * (1 - e);
  const storm = smooth(0.28, 0.5, minor * e * 2);
  const cloudCover = clamp01(0.1 + 0.9 * smooth(0.3, 0.75, gloom) + 0.3 * storm);
  const rain = Math.max(0.85 * smooth(0.55, 0.8, gloom), storm);
  const sun = clamp01(1 - cloudCover * 1.15);
  const birds = smooth(0.4, 0.8, sun) * (1 - 0.6 * e);
  const wind = clamp01(0.2 + 0.5 * e + 0.3 * storm);
  return { cloudCover, rain, storm, sun, birds, wind, ...lightning(plan, t, storm) };
}

/** Time of day of the photographic sky. `auto` reads the template palette (dark palette: night). */
export const TIME_MODES = ['auto', 'day', 'sunset', 'night'] as const;
export type TimeMode = (typeof TIME_MODES)[number];
export const DEFAULT_TIME: TimeMode = 'auto';

export function isTimeMode(value: unknown): value is TimeMode {
  return typeof value === 'string' && (TIME_MODES as readonly string[]).includes(value);
}

/** Resolves `auto` from the linear luminance of the template background. */
export function resolveTime(mode: TimeMode, backgroundLuminance: number): Exclude<TimeMode, 'auto'> {
  if (mode !== 'auto') return mode;
  return backgroundLuminance < 0.02 ? 'night' : backgroundLuminance < 0.1 ? 'sunset' : 'day';
}

/** Photos of `public/sky/<id>.jpg` (equirectangular, CC0 Poly Haven HDRIs tone-mapped by `scripts/blender/hdri_to_jpg.py`). */
export const SKY_IDS = ['clear', 'cloudy', 'overcast', 'storm', 'sunset', 'night', 'nightcloud'] as const;
export type SkyId = (typeof SKY_IDS)[number];

/** Crossfade weights (sum 1) of the sky photos for a weather and a time of day. Pure. */
export function skyWeights(w: Pick<Weather, 'cloudCover' | 'storm'>, time: Exclude<TimeMode, 'auto'>): Record<SkyId, number> {
  const out: Record<SkyId, number> = { clear: 0, cloudy: 0, overcast: 0, storm: 0, sunset: 0, night: 0, nightcloud: 0 };
  const heavy = smooth(0.55, 0.9, w.cloudCover);
  const storm = clamp01(w.storm);
  if (time === 'night') {
    const cloud = Math.max(storm, smooth(0.2, 0.8, w.cloudCover));
    out.nightcloud = cloud;
    out.night = 1 - cloud;
    return out;
  }
  out.storm = storm;
  out.overcast = (1 - storm) * heavy;
  if (time === 'sunset') {
    out.sunset = 1 - out.storm - out.overcast;
    return out;
  }
  const light = (1 - storm) * (1 - heavy);
  out.cloudy = light * smooth(0.15, 0.55, w.cloudCover);
  out.clear = light - out.cloudy;
  return out;
}
