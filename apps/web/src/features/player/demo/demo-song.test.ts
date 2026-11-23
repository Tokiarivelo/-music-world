import { describe, expect, it } from 'vitest';
import { DEMO_SONG } from './demo-song';

describe('demo song (02-music-analysis task 10)', () => {
  it('ships a real analysis that the engine can play', () => {
    const { analysis } = DEMO_SONG;
    expect(analysis.schema).toBe('music-world.analysis.v1');
    expect(analysis.durationSec).toBeGreaterThan(50);
    expect(analysis.notes.length).toBeGreaterThanOrEqual(100);
    expect(analysis.sections.at(-1)?.end).toBe(analysis.durationSec);
    expect(DEMO_SONG.audioUrl).toMatch(/^\/demo\/.+\.mp3$/);
  });
});
