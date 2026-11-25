'use client';

import { useCallback, useState, useSyncExternalStore } from 'react';
import { TOUR_STEPS, TOUR_STORAGE_KEY, type TourStepId } from '../consts/onboarding.consts';

export interface Tour {
  /** The step on screen, or null when the tour is closed. */
  readonly step: TourStepId | null;
  readonly index: number;
  readonly total: number;
  next(): void;
  close(): void;
  restart(): void;
}

function wasSeen(): boolean {
  try {
    return window.localStorage.getItem(TOUR_STORAGE_KEY) === '1';
  } catch {
    return false; // storage blocked: show the tour, it just will not be remembered
  }
}

function remember(): void {
  try {
    window.localStorage.setItem(TOUR_STORAGE_KEY, '1');
  } catch {
    /* a per-viewer convenience only */
  }
}

const listeners = new Set<() => void>();
function subscribe(listener: () => void): () => void {
  listeners.add(listener);
  return () => listeners.delete(listener);
}

/** First-visit tour: shown once on the client (the server snapshot says "seen", so nothing is rendered there). */
export function useTour(): Tour {
  const seen = useSyncExternalStore(subscribe, wasSeen, () => true);
  const [index, setIndex] = useState<number | null>(0);
  const [forced, setForced] = useState(false);
  const close = useCallback(() => {
    remember();
    listeners.forEach((listener) => listener());
    setIndex(null);
  }, []);
  const next = useCallback(() => {
    if (index !== null && index + 1 < TOUR_STEPS.length) setIndex(index + 1);
    else close();
  }, [index, close]);
  const restart = useCallback(() => {
    setForced(true);
    setIndex(0);
  }, []);
  const open = index !== null && (forced || !seen);
  return {
    step: open ? (TOUR_STEPS[index] ?? null) : null,
    index: index ?? 0,
    total: TOUR_STEPS.length,
    next,
    close,
    restart,
  };
}
