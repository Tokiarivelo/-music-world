import { act, renderHook } from '@testing-library/react';
import { beforeEach, describe, expect, it } from 'vitest';
import { TOUR_STEPS, TOUR_STORAGE_KEY } from '../consts/onboarding.consts';
import { useTour } from './use-tour';

beforeEach(() => window.localStorage.clear());

describe('guided tour (I25)', () => {
  it('opens on the first step the first time and walks through every step', () => {
    const { result } = renderHook(() => useTour());
    expect(result.current.step).toBe(TOUR_STEPS[0]);
    for (let i = 1; i < TOUR_STEPS.length; i++) {
      act(() => result.current.next());
      expect(result.current.step).toBe(TOUR_STEPS[i]);
    }
    act(() => result.current.next());
    expect(result.current.step).toBeNull();
    expect(window.localStorage.getItem(TOUR_STORAGE_KEY)).toBe('1');
  });

  it('stays closed once skipped, and restarts on demand', () => {
    const first = renderHook(() => useTour());
    act(() => first.result.current.close());
    expect(first.result.current.step).toBeNull();
    const second = renderHook(() => useTour());
    expect(second.result.current.step).toBeNull();
    act(() => second.result.current.restart());
    expect(second.result.current.step).toBe(TOUR_STEPS[0]);
  });

  it('still works when storage is blocked', () => {
    const original = Storage.prototype.getItem;
    Storage.prototype.getItem = () => {
      throw new Error('blocked');
    };
    try {
      const { result } = renderHook(() => useTour());
      expect(result.current.step).toBe(TOUR_STEPS[0]);
    } finally {
      Storage.prototype.getItem = original;
    }
  });
});
