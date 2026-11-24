/**
 * Analysis stages in pipeline order. Must match `STAGES` in
 * apps/api/music_world/analysis/application/use_cases/analyze_audio.py (checked by an API test).
 */
export const ANALYSIS_STAGES = [
  { id: 'decode', label: 'Decoding audio' },
  { id: 'separate', label: 'Separating vocals, drums, bass and instruments' },
  { id: 'transcribe', label: 'Detecting notes' },
  { id: 'rhythm', label: 'Tempo, beats and kicks' },
  { id: 'structure', label: 'Song sections' },
  { id: 'harmony', label: 'Key and chords' },
  { id: 'lyrics', label: 'Lyrics' },
  { id: 'store', label: 'Saving the analysis' },
] as const;

export type AnalysisStageId = (typeof ANALYSIS_STAGES)[number]['id'];

/** Requirement 1.1 limits (the API re-checks them by content). */
export const MAX_AUDIO_BYTES = 25 * 1024 * 1024;
export const MAX_LRC_BYTES = 64 * 1024;
export const AUDIO_ACCEPT = '.mp3,.wav,.flac,audio/mpeg,audio/wav,audio/x-wav,audio/flac';
export const AUDIO_EXTENSIONS = ['mp3', 'wav', 'flac'] as const;
export const LRC_ACCEPT = '.lrc,text/plain';

/** Job polling while the worker analyses the song (a 3-minute song takes several minutes on CPU). */
export const POLL_INTERVAL_MS = 1500;

export const PLAY_PATH = (projectId: string): string => `/play/${encodeURIComponent(projectId)}`;

export const UPLOAD_TEXT = {
  title: 'Turn a song into a world',
  intro:
    'Upload an MP3, WAV or FLAC file (25 MB and 3 minutes max). Add timed lyrics as an .lrc file if you have them.',
  audioLabel: 'Song',
  lrcLabel: 'Timed lyrics (.lrc, optional)',
  submit: 'Analyse',
  uploading: 'Uploading…',
  analysing: 'Analysing your song',
  progressLabel: 'Analysis progress',
  ready: 'Analysis ready — opening the world…',
  royaltyNote: 'Only upload music you have the rights to use.',
  dataNote:
    "To design your world, a text summary of your song (key, tempo, notes, lyrics) is sent to Meta's Muse model, which Meta may use to train its models.",
} as const;

/** Message keys → user-facing text (API error codes and client-side checks). */
export const UPLOAD_ERRORS: Record<string, string> = {
  NO_FILE: 'Choose an audio file first.',
  CLIENT_TOO_LARGE: 'This file is larger than 25 MB.',
  CLIENT_FORMAT: 'Only MP3, WAV and FLAC files are accepted.',
  CLIENT_LRC_TOO_LARGE: 'The lyrics file is larger than 64 KB.',
  AUDIO_TOO_LARGE: 'This file is larger than 25 MB.',
  AUDIO_FORMAT_UNSUPPORTED: 'This file is not an MP3, WAV or FLAC file.',
  AUDIO_TOO_LONG: 'This song is longer than 3 minutes.',
  AUDIO_UNREADABLE: 'This audio file could not be read.',
  LRC_INVALID: 'The lyrics file must be UTF-8 text.',
  AUDIO_DECODE_FAILED: 'This audio file could not be decoded.',
  SEPARATION_FAILED: 'The analysis failed while separating the instruments.',
  TRANSCRIPTION_FAILED: 'The analysis failed while detecting notes.',
  NETWORK: 'The server could not be reached. Try again.',
  UNKNOWN: 'Something went wrong. Try again.',
};
