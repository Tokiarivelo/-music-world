import fc from 'fast-check';
import { describe, expect, it } from 'vitest';
import { ANALYSIS_STAGES, AUDIO_EXTENSIONS, MAX_AUDIO_BYTES, MAX_LRC_BYTES } from '../consts/upload.consts';
import { checkFiles, percent, stageViews } from './stage-progress';

const LIMITS = { maxAudioBytes: MAX_AUDIO_BYTES, maxLrcBytes: MAX_LRC_BYTES, extensions: AUDIO_EXTENSIONS };
const IDS = ANALYSIS_STAGES.map((s) => s.id);

describe('stageViews (requirement 1.3)', () => {
  it('marks earlier stages done, the current one active, later ones pending', () => {
    const views = stageViews('transcribe', 'running');
    expect(views.map((v) => v.state)).toEqual([
      'done',
      'done',
      'active',
      'pending',
      'pending',
      'pending',
      'pending',
      'pending',
    ]);
  });

  it('is all done when the job is done and all pending before the first stage', () => {
    expect(stageViews('store', 'done').every((v) => v.state === 'done')).toBe(true);
    expect(stageViews(null, 'queued').every((v) => v.state === 'pending')).toBe(true);
  });

  it('has at most one active stage and states ordered done → active → pending', () => {
    fc.assert(
      fc.property(
        fc.option(fc.constantFrom(...IDS, 'unknown')),
        fc.constantFrom('queued', 'running', 'done', 'failed'),
        (stage, status) => {
          const order = { done: 0, active: 1, pending: 2 } as const;
          const ranks = stageViews(stage, status).map((v) => order[v.state]);
          expect(ranks).toEqual([...ranks].sort((a, b) => a - b));
          expect(ranks.filter((r) => r === 1).length).toBeLessThanOrEqual(1);
        },
      ),
    );
  });
});

describe('percent and client-side checks', () => {
  it('clamps progress to an integer percentage', () => {
    expect([percent(-1), percent(0.333), percent(2), percent(Number.NaN)]).toEqual([0, 33, 100, 0]);
  });

  it('rejects missing, wrongly named, too large files before upload', () => {
    expect(checkFiles(null, null, LIMITS)).toBe('NO_FILE');
    expect(checkFiles({ name: 'song.ogg', size: 10 }, null, LIMITS)).toBe('CLIENT_FORMAT');
    expect(checkFiles({ name: 'song.MP3', size: MAX_AUDIO_BYTES + 1 }, null, LIMITS)).toBe('CLIENT_TOO_LARGE');
    expect(checkFiles({ name: 'a.flac', size: 10 }, { size: MAX_LRC_BYTES + 1 }, LIMITS)).toBe('CLIENT_LRC_TOO_LARGE');
    expect(checkFiles({ name: 'a.wav', size: MAX_AUDIO_BYTES }, { size: 10 }, LIMITS)).toBeNull();
  });
});
