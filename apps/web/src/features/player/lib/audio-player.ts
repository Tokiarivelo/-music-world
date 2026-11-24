import type {
  AudioBufferLike,
  AudioBufferSourceNodeLike,
  AudioClock,
  AudioContextLike,
} from '../interfaces/audio.interfaces';

export const MIN_RATE = 0.25;
export const MAX_RATE = 4;

/**
 * Plays one decoded song and is the audio clock of the world.
 *
 * `now() = playing ? offset + (ctx.currentTime - startedAtCtx) * rate : offset`, clamped to [0, duration].
 * `AudioBufferSourceNode`s are one-shot, so a new one is created on every play / seek / rate change while playing.
 */
export class AudioPlayer implements AudioClock {
  private source: AudioBufferSourceNodeLike | null = null;
  private startedAtCtx = 0;
  private offsetSec = 0;
  private currentRate = 1;
  private playing = false;
  private muted = false;
  private gainNode: ReturnType<NonNullable<AudioContextLike['createGain']>> | null = null;

  constructor(
    private readonly ctx: AudioContextLike,
    private readonly buffer: AudioBufferLike,
  ) {}

  duration(): number {
    return this.buffer.duration;
  }

  now(): number {
    const raw = this.playing ? this.offsetSec + (this.ctx.currentTime - this.startedAtCtx) * this.currentRate : this.offsetSec;
    return clamp(raw, 0, this.duration());
  }

  /** True while the song is advancing (false once the end is reached). */
  isPlaying(): boolean {
    return this.playing && this.now() < this.duration();
  }

  rate(): number {
    return this.currentRate;
  }

  /** Starts or resumes; restarts from 0 when at the end. */
  play(): void {
    if (this.isPlaying()) return;
    const from = this.now() >= this.duration() ? 0 : this.now();
    this.startAt(from);
  }

  pause(): void {
    if (!this.playing) return;
    this.offsetSec = this.now();
    this.playing = false;
    this.releaseSource();
  }

  seek(sec: number): void {
    if (!Number.isFinite(sec)) throw new RangeError(`seek: not a finite time: ${sec}`);
    const target = clamp(sec, 0, this.duration());
    if (this.playing) this.startAt(target);
    else this.offsetSec = target;
  }

  setRate(rate: number): void {
    if (!Number.isFinite(rate) || rate < MIN_RATE || rate > MAX_RATE) {
      throw new RangeError(`setRate: rate must be in [${MIN_RATE}, ${MAX_RATE}], got ${rate}`);
    }
    if (this.playing) {
      this.offsetSec = this.now();
      this.startedAtCtx = this.ctx.currentTime;
      if (this.source) this.source.playbackRate.value = rate;
    }
    this.currentRate = rate;
  }

  /** Silences the song without touching its clock ("Play my edits" plays the synthesized score instead). */
  setMuted(muted: boolean): void {
    this.muted = muted;
    if (this.gainNode) this.gainNode.gain.value = muted ? 0 : 1;
  }

  /** Stops and rewinds to 0. */
  stop(): void {
    this.playing = false;
    this.offsetSec = 0;
    this.releaseSource();
  }

  private startAt(offset: number): void {
    this.releaseSource();
    const source = this.ctx.createBufferSource();
    source.buffer = this.buffer;
    source.playbackRate.value = this.currentRate;
    if (this.ctx.createGain) {
      this.gainNode?.disconnect();
      this.gainNode = this.ctx.createGain();
      this.gainNode.gain.value = this.muted ? 0 : 1;
      this.gainNode.connect(this.ctx.destination);
      source.connect(this.gainNode);
    } else {
      source.connect(this.ctx.destination);
    }
    source.start(0, offset);
    this.source = source;
    this.offsetSec = offset;
    this.startedAtCtx = this.ctx.currentTime;
    this.playing = true;
  }

  private releaseSource(): void {
    if (!this.source) return;
    this.source.onended = null;
    try {
      this.source.stop();
    } catch {
      // already ended: nothing to stop
    }
    this.source.disconnect();
    this.source = null;
  }
}

function clamp(value: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, value));
}
