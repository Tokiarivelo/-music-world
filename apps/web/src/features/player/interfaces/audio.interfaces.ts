/** Read-only view of the playback time: the only time source of the world (tech.md). */
export interface AudioClock {
  /** Seconds from song start, clamped to [0, duration]. */
  now(): number;
  isPlaying(): boolean;
  rate(): number;
}

/** The subset of Web Audio used by the player, so tests can drive `currentTime`. */
export interface AudioParamLike {
  value: number;
}

export interface AudioBufferSourceNodeLike {
  buffer: AudioBufferLike | null;
  readonly playbackRate: AudioParamLike;
  // Web Audio passes `(this: node, ev: Event)`; the player only clears it.
  onended: ((...args: never[]) => unknown) | null;
  connect(destination: unknown): unknown;
  start(when?: number, offset?: number): void;
  stop(when?: number): void;
  disconnect(): void;
}

export interface AudioBufferLike {
  readonly duration: number;
}

export interface AudioContextLike {
  readonly currentTime: number;
  readonly destination: unknown;
  createBufferSource(): AudioBufferSourceNodeLike;
}
