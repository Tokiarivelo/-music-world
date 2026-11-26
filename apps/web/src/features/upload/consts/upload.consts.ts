/**
 * Analysis stages in pipeline order. Must match `STAGES` in
 * apps/api/music_world/analysis/application/use_cases/analyze_audio.py (checked by an API test).
 */
export const ANALYSIS_STAGES = [
  { id: 'decode' },
  { id: 'separate' },
  { id: 'transcribe' },
  { id: 'rhythm' },
  { id: 'structure' },
  { id: 'harmony' },
  { id: 'lyrics' },
  { id: 'store' },
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

export const PLAY_PATH = (projectId: string, templateRef: string | null = null): string =>
  `/play/${encodeURIComponent(projectId)}${templateRef ? `?template=${encodeURIComponent(templateRef)}` : ''}`;

/** Store templates offered at upload. */
export const UPLOAD_TEMPLATE_LIMIT = 24;
