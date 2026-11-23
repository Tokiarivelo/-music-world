import { act, renderHook, waitFor } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import { FakeAudioContext } from '../lib/fake-audio-context';
import { useSongPlayer, type PlayerContext } from './use-song-player';

class FakePlayerContext extends FakeAudioContext implements PlayerContext {
  resumed = 0;
  closed = false;
  async resume() {
    this.resumed++;
  }
  async close() {
    this.closed = true;
  }
}

function setup() {
  const ctx = new FakePlayerContext();
  const deps = { createContext: () => ctx, loadBuffer: async () => ({ duration: 24 }) };
  const hook = renderHook(() => useSongPlayer(deps));
  return { ctx, hook };
}

describe('useSongPlayer (task 5, requirement 5.2)', () => {
  it('exposes a stable clock that reads 0 until the song is ready', async () => {
    const { hook } = setup();
    const clock = hook.result.current.clock;
    expect(clock.now()).toBe(0);
    await waitFor(() => expect(hook.result.current.ready).toBe(true));
    expect(hook.result.current.clock).toBe(clock);
    expect(hook.result.current.duration).toBe(24);
  });

  it('plays, pauses and seeks exactly on the audio clock', async () => {
    const { ctx, hook } = setup();
    await waitFor(() => expect(hook.result.current.ready).toBe(true));
    const { clock } = hook.result.current;
    act(() => hook.result.current.toggle());
    expect(hook.result.current.playing).toBe(true);
    expect(ctx.resumed).toBe(1);
    ctx.advance(2.5);
    expect(clock.now()).toBeCloseTo(2.5, 12);
    act(() => hook.result.current.toggle());
    ctx.advance(10);
    expect(clock.now()).toBeCloseTo(2.5, 12); // paused: the world freezes
    act(() => hook.result.current.seek(12.25));
    expect(clock.now()).toBe(12.25);
    act(() => hook.result.current.seekBy(-5));
    expect(clock.now()).toBeCloseTo(7.25, 12);
    act(() => hook.result.current.seekBy(-50));
    expect(clock.now()).toBe(0);
  });

  it('closes the audio context on unmount', async () => {
    const { ctx, hook } = setup();
    await waitFor(() => expect(hook.result.current.ready).toBe(true));
    hook.unmount();
    expect(ctx.closed).toBe(true);
  });
});
