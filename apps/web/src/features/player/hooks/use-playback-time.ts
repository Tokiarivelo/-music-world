'use client';

import { useEffect, useState } from 'react';
import type { AudioClock } from '../interfaces/audio.interfaces';

/** Song time for the 2D UI (slider, label), sampled once per animation frame from the audio clock. */
export function usePlaybackTime(clock: AudioClock): number {
  const [time, setTime] = useState(0);
  useEffect(() => {
    let frame = 0;
    const tick = () => {
      setTime(clock.now());
      frame = requestAnimationFrame(tick);
    };
    frame = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(frame);
  }, [clock]);
  return time;
}
