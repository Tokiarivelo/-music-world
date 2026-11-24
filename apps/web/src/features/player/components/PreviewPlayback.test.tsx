import { act, cleanup, render } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { NEON_NOCTURNE } from '@/templates/default';
import type { WorldScene } from '@/xr/world-host';
import { PreviewPlayback } from './PreviewPlayback';

const scenes: WorldScene[] = [];
vi.mock('@/features/world-view', () => ({
  WorldView: ({ scene }: { scene?: WorldScene }) => {
    if (scene) scenes.push(scene);
    return null;
  },
}));

afterEach(() => {
  cleanup();
  scenes.length = 0;
});

function deps() {
  const buffer = { duration: 10, length: 441000, sampleRate: 44100, numberOfChannels: 1, getChannelData: () => new Float32Array(1) };
  const context = {
    state: 'running',
    currentTime: 0,
    destination: {},
    createBufferSource: () => ({ buffer: null, playbackRate: { value: 1 }, connect: vi.fn(), start: vi.fn(), stop: vi.fn(), disconnect: vi.fn(), onended: null }),
    resume: vi.fn(async () => undefined),
    close: vi.fn(async () => undefined),
  };
  return { createContext: vi.fn(() => context as never), loadBuffer: vi.fn(async () => buffer as never) };
}

describe('PreviewPlayback', () => {
  it('swaps the template without recreating the audio player or its clock', async () => {
    const fake = deps();
    const next = { ...NEON_NOCTURNE, name: 'Changed' };
    const { rerender } = render(<PreviewPlayback template={NEON_NOCTURNE} deps={fake} />);
    await act(async () => undefined);
    rerender(<PreviewPlayback template={next} deps={fake} />);
    await act(async () => undefined);
    const first = scenes[0]!;
    const last = scenes.at(-1)!;
    expect(first.template).toBe(NEON_NOCTURNE);
    expect(last.template).toBe(next);
    expect(last.clock).toBe(first.clock); // the same audio clock: the playback time is kept
    expect(fake.createContext).toHaveBeenCalledTimes(1);
    expect(fake.loadBuffer).toHaveBeenCalledTimes(1);
  });
});
