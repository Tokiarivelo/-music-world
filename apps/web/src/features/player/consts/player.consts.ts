export const PLAYER_TEXT = {
  play: 'Play',
  pause: 'Pause',
  seek: 'Song position',
  loading: 'Preparing the demo song…',
  demoNote: (title: string): string => `Demo song “${title}”, composed for Music World`,
  loadingProject: 'Loading the world of your song…',
} as const;

/** Message keys (API error codes) → user-facing text on `/play/<projectId>`. */
export const PLAYER_ERRORS: Record<string, string> = {
  PROJECT_NOT_FOUND: 'This song does not exist.',
  ANALYSIS_NOT_READY: 'This song is still being analysed. Come back in a minute.',
  NETWORK: 'The server could not be reached. Try again.',
  UNKNOWN: 'This world could not be loaded.',
};

/** Keyboard seek step (frontend.md: arrows = seek ±5 s). */
export const SEEK_STEP_SEC = 5;
/** Demo synthesis: sample rate, note attack/release and master gain. */
export const SYNTH_SAMPLE_RATE = 44_100;
export const SYNTH_ATTACK_SEC = 0.01;
export const SYNTH_RELEASE_SEC = 0.12;
export const SYNTH_GAIN = 0.12;
/** Fixed seed of the demo world (same audio + template + seed = same world). */
export const DEMO_SEED = 1;
