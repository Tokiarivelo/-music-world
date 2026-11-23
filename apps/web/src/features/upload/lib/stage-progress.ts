import { ANALYSIS_STAGES } from '../consts/upload.consts';
import type { StageView } from '../interfaces/upload.interfaces';

/** Per-stage view of a job: stages before the current one are done, later ones pending. */
export function stageViews(stage: string | null, status: string): StageView[] {
  const current = ANALYSIS_STAGES.findIndex((s) => s.id === stage);
  return ANALYSIS_STAGES.map((s, i) => ({
    id: s.id,
    label: s.label,
    state:
      status === 'done' || (current >= 0 && i < current)
        ? 'done'
        : i === current && status === 'running'
          ? 'active'
          : 'pending',
  }));
}

/** Overall progress in percent (0–100, integer). */
export function percent(progress: number): number {
  if (!Number.isFinite(progress)) return 0;
  return Math.round(Math.min(1, Math.max(0, progress)) * 100);
}

/** Client-side checks before upload (the API re-checks by content). Returns a message key or null. */
export function checkFiles(
  audio: { name: string; size: number } | null,
  lrc: { size: number } | null,
  limits: { maxAudioBytes: number; maxLrcBytes: number; extensions: readonly string[] },
): string | null {
  if (!audio) return 'NO_FILE';
  const ext = audio.name.split('.').pop()?.toLowerCase() ?? '';
  if (!limits.extensions.includes(ext)) return 'CLIENT_FORMAT';
  if (audio.size > limits.maxAudioBytes) return 'CLIENT_TOO_LARGE';
  if (lrc && lrc.size > limits.maxLrcBytes) return 'CLIENT_LRC_TOO_LARGE';
  return null;
}
