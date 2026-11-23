/** Text shown by the spatial panel (07-xr-mode requirement 4.2). Pure. */

export function formatClock(sec: number): string {
  const s = Number.isFinite(sec) ? Math.max(0, Math.floor(sec)) : 0;
  return `${Math.floor(s / 60)}:${String(s % 60).padStart(2, '0')}`;
}

export function panelTime(now: number, duration: number): string {
  return `${formatClock(now)} / ${formatClock(duration)}`;
}

/** Progress in whole percent, clamped to [0, 100] (the bar is only updated when this value changes). */
export function progressPercent(now: number, duration: number): number {
  if (!(duration > 0) || !Number.isFinite(now)) return 0;
  return Math.round(Math.min(1, Math.max(0, now / duration)) * 100);
}
