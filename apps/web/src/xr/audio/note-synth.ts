/**
 * Single-note synthesizer (improvement I9): Web Audio, no samples. One `AudioContext` created lazily from a user
 * gesture, a pool of 8 voices (the oldest is stolen), soft attack and release. Never called from the playback loop.
 */

export const VOICE_POOL = 8;
export const NOTE_SECONDS = 0.5;
const ATTACK = 0.01;
const RELEASE = 0.18;
const PEAK_GAIN = 0.28;

export function midiToHz(midi: number): number {
  return 440 * 2 ** ((midi - 69) / 12);
}

/** Subset of the Web Audio API the synth uses (lets tests pass a fake). */
export interface SynthParam {
  value: number;
  setValueAtTime(v: number, t: number): unknown;
  linearRampToValueAtTime(v: number, t: number): unknown;
  setTargetAtTime(v: number, t: number, tc: number): unknown;
}
export interface SynthNode {
  connect(dest: unknown): unknown;
  disconnect(): void;
}
export interface SynthOscillator extends SynthNode {
  type: string;
  frequency: SynthParam;
  start(t?: number): void;
  stop(t?: number): void;
  onended: (() => void) | null;
}
export interface SynthGain extends SynthNode {
  gain: SynthParam;
}
export interface SynthContext {
  readonly currentTime: number;
  readonly destination: unknown;
  readonly state: string;
  resume(): Promise<void>;
  createOscillator(): SynthOscillator;
  createGain(): SynthGain;
}

interface Voice {
  readonly osc: SynthOscillator;
  readonly gain: SynthGain;
  readonly startedAt: number;
}

export class NoteSynth {
  private ctx: SynthContext | null = null;
  private readonly voices: Voice[] = [];

  constructor(private readonly create: () => SynthContext | null = defaultContext) {}

  get activeVoices(): number {
    return this.voices.length;
  }

  /** Plays a pitch right now; returns false when audio is unavailable. Call it from a user gesture. */
  playNote(midi: number, velocity = 0.7, seconds = NOTE_SECONDS): boolean {
    return this.playAt(midi, velocity, seconds, 0);
  }

  /** Plays a pitch `delay` seconds from now (the score scheduler, "Play my edits"). */
  playAt(midi: number, velocity: number, seconds: number, delay: number): boolean {
    if (!Number.isFinite(midi)) return false;
    const ctx = this.context();
    if (!ctx) return false;
    if (ctx.state === 'suspended') void ctx.resume();
    if (this.voices.length >= VOICE_POOL) this.release(this.voices[0]!, ctx, 0);

    const now = ctx.currentTime + Math.max(0, delay);
    const peak = PEAK_GAIN * Math.min(1, Math.max(0.1, velocity));
    const osc = ctx.createOscillator();
    const gain = ctx.createGain();
    osc.type = 'triangle';
    osc.frequency.setValueAtTime(midiToHz(midi), now);
    gain.gain.setValueAtTime(0, now);
    gain.gain.linearRampToValueAtTime(peak, now + ATTACK);
    gain.gain.setTargetAtTime(0, now + Math.max(ATTACK, seconds - RELEASE), RELEASE / 3);
    osc.connect(gain);
    gain.connect(ctx.destination);
    const voice: Voice = { osc, gain, startedAt: now };
    this.voices.push(voice);
    osc.onended = () => this.drop(voice);
    osc.start(now);
    osc.stop(now + seconds + RELEASE);
    return true;
  }

  dispose(): void {
    const ctx = this.ctx;
    for (const v of [...this.voices]) if (ctx) this.release(v, ctx, 0);
    this.ctx = null;
  }

  private context(): SynthContext | null {
    this.ctx ??= this.create();
    return this.ctx;
  }

  private release(v: Voice, ctx: SynthContext, after: number): void {
    try {
      v.gain.gain.setTargetAtTime(0, ctx.currentTime, 0.01);
      v.osc.stop(ctx.currentTime + after + 0.05);
    } catch {
      // already stopped
    }
    this.drop(v);
  }

  private drop(v: Voice): void {
    const i = this.voices.indexOf(v);
    if (i >= 0) this.voices.splice(i, 1);
    try {
      v.osc.disconnect();
      v.gain.disconnect();
    } catch {
      // ignore
    }
  }
}

function defaultContext(): SynthContext | null {
  try {
    const Ctor = (globalThis as { AudioContext?: new () => unknown }).AudioContext;
    return Ctor ? (new Ctor() as SynthContext) : null;
  } catch {
    return null;
  }
}
