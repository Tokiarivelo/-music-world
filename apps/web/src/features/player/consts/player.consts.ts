export const PLAYER_TEXT = {
  play: 'Play',
  pause: 'Pause',
  seek: 'Song position',
  loading: 'Preparing the demo song…',
  synthNote: 'Demo song synthesized from its own notes',
} as const;

/** Keyboard seek step (frontend.md: arrows = seek ±5 s). */
export const SEEK_STEP_SEC = 5;
/** Demo synthesis: sample rate, note attack/release and master gain. */
export const SYNTH_SAMPLE_RATE = 44_100;
export const SYNTH_ATTACK_SEC = 0.01;
export const SYNTH_RELEASE_SEC = 0.12;
export const SYNTH_GAIN = 0.12;
/** Fixed seed of the demo world (same audio + template + seed = same world). */
export const DEMO_SEED = 1;
