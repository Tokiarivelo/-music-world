/**
 * "Play my edits" (I9 requirement 9): plays the synthesized notes of the edited score in step with the song clock.
 * A rolling scheduler (every 100 ms) hands the notes due in the next window to the synth, with a delay computed from the
 * clock at that moment, so the score follows pauses, seeks and rate changes and cannot drift by more than one window.
 * Only active while the option is on; never part of the render loop.
 */
export interface ScoreNote {
  readonly time: number;
  readonly duration: number;
  readonly midi: number;
  readonly velocity: number;
}

export interface ScoreClock {
  now(): number;
  isPlaying(): boolean;
  rate(): number;
}

export interface ScoreSynth {
  playAt(midi: number, velocity: number, seconds: number, delay: number): boolean;
}

export const SCORE_TICK_MS = 100;
export const SCORE_WINDOW_SEC = 0.35;

export class ScorePlayer {
  private notes: readonly ScoreNote[] = [];
  private cursor = 0;
  private lastNow = 0;
  private timer: ReturnType<typeof setInterval> | null = null;

  constructor(
    private readonly synth: ScoreSynth,
    private readonly clock: ScoreClock,
  ) {}

  /** Replaces the score (sorted by time here); scheduling continues from the current clock time. */
  setScore(notes: readonly ScoreNote[]): void {
    this.notes = [...notes].sort((a, b) => a.time - b.time);
    this.seekTo(this.clock.now());
  }

  start(): void {
    if (this.timer) return;
    this.seekTo(this.clock.now());
    this.timer = setInterval(() => this.tick(), SCORE_TICK_MS);
  }

  stop(): void {
    if (this.timer) clearInterval(this.timer);
    this.timer = null;
  }

  get running(): boolean {
    return this.timer !== null;
  }

  /** Schedules the notes whose onset falls in the next window; notes already passed are never played. */
  tick(): void {
    const now = this.clock.now();
    // A seek (or a restart) moves the clock by more than the time a tick can account for: find the new place.
    if (now < this.lastNow - 1e-6 || now - this.lastNow > 1) this.seekTo(now);
    this.lastNow = now;
    if (!this.clock.isPlaying()) return;
    const rate = Math.max(0.01, this.clock.rate());
    const until = now + SCORE_WINDOW_SEC * rate;
    while (this.cursor < this.notes.length && this.notes[this.cursor]!.time < until) {
      const n = this.notes[this.cursor]!;
      this.cursor += 1;
      if (n.time < now) continue;
      this.synth.playAt(n.midi, n.velocity, Math.max(0.1, Math.min(2, n.duration)) / rate, (n.time - now) / rate);
    }
  }

  private seekTo(t: number): void {
    let lo = 0;
    let hi = this.notes.length;
    while (lo < hi) {
      const mid = (lo + hi) >> 1;
      if (this.notes[mid]!.time < t) lo = mid + 1;
      else hi = mid;
    }
    this.cursor = lo;
    this.lastNow = t;
  }
}
