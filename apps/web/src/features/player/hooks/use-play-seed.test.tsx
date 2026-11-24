import { renderHook } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import { usePlaySeed } from './use-play-seed';

describe('usePlaySeed', () => {
  it('keeps the song seed until the first Play, then gives each run its own seed', () => {
    const { result, rerender } = renderHook(({ run }) => usePlaySeed(run, 1234, () => 99), { initialProps: { run: 0 } });
    expect(result.current).toBe(1234);
    rerender({ run: 1 });
    const first = result.current;
    rerender({ run: 2 });
    const second = result.current;
    expect(new Set([1234, first, second]).size).toBe(3);
    rerender({ run: 1 });
    expect(result.current).toBe(first); // a run keeps its seed (pause / resume, re-render)
  });

  it('differs between page views (salt) and between songs', () => {
    const a = renderHook(() => usePlaySeed(1, 1234, () => 1)).result.current;
    const b = renderHook(() => usePlaySeed(1, 1234, () => 2)).result.current;
    const c = renderHook(() => usePlaySeed(1, 4321, () => 1)).result.current;
    expect(new Set([a, b, c]).size).toBe(3);
  });
});
