'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import type { AudioBufferLike, AudioClock, AudioContextLike } from '../interfaces/audio.interfaces';
import { AudioPlayer } from '../lib/audio-player';

/** Clock used before the song is decoded: the world shows t = 0. */
const IDLE_CLOCK: AudioClock = { now: () => 0, isPlaying: () => false, rate: () => 1 };

export interface SongPlayer {
  /** Stable clock object for the world: always reads the current player. */
  clock: AudioClock;
  ready: boolean;
  playing: boolean;
  duration: number;
  toggle(): void;
  seek(sec: number): void;
  seekBy(deltaSec: number): void;
}

export type PlayerContext = AudioContextLike & { resume(): Promise<unknown>; close(): Promise<unknown> };

export interface SongPlayerDeps {
  createContext(): PlayerContext;
  loadBuffer(): Promise<AudioBufferLike>;
}

/** Owns one AudioContext + AudioPlayer; `clock.now()` is the world's only time source. */
export function useSongPlayer(deps: SongPlayerDeps): SongPlayer {
  const playerRef = useRef<AudioPlayer | null>(null);
  const ctxRef = useRef<PlayerContext | null>(null);
  const [ready, setReady] = useState(false);
  const [playing, setPlaying] = useState(false);
  const [duration, setDuration] = useState(0);
  const depsRef = useRef(deps);

  const [clock] = useState<AudioClock>(() => ({
    now: () => (playerRef.current ?? IDLE_CLOCK).now(),
    isPlaying: () => (playerRef.current ?? IDLE_CLOCK).isPlaying(),
    rate: () => (playerRef.current ?? IDLE_CLOCK).rate(),
  }));

  useEffect(() => {
    let cancelled = false;
    const ctx = depsRef.current.createContext();
    ctxRef.current = ctx;
    depsRef.current
      .loadBuffer()
      .then((buffer) => {
        if (cancelled) return;
        playerRef.current = new AudioPlayer(ctx, buffer);
        setDuration(buffer.duration);
        setReady(true);
      })
      .catch((error: unknown) => console.error('[player] could not prepare the song', error));
    return () => {
      cancelled = true;
      playerRef.current?.stop();
      playerRef.current = null;
      void ctx.close().catch(() => undefined);
    };
  }, []);

  const toggle = useCallback(() => {
    const player = playerRef.current;
    if (!player) return;
    if (player.isPlaying()) {
      player.pause();
      setPlaying(false);
    } else {
      void ctxRef.current?.resume(); // autoplay policy: resume inside the user gesture
      player.play();
      setPlaying(true);
    }
  }, []);

  const seek = useCallback((sec: number) => playerRef.current?.seek(sec), []);
  const seekBy = useCallback((delta: number) => {
    const player = playerRef.current;
    if (player) player.seek(player.now() + delta);
  }, []);

  return { clock, ready, playing, duration, toggle, seek, seekBy };
}
