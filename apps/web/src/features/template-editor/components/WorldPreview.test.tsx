import { act, cleanup, render } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { NEON_NOCTURNE } from '@/templates/default';
import type { Template } from '@/templates/generated';
import { setName } from '../lib/editor-model';
import { WorldPreview } from './WorldPreview';

const seen: Template[] = [];
vi.mock('@/features/player', () => ({
  PreviewPlayback: ({ template }: { template: Template }) => {
    seen.push(template);
    return null;
  },
}));

beforeEach(() => {
  vi.useFakeTimers();
  seen.length = 0;
});
afterEach(() => {
  cleanup();
  vi.useRealTimers();
});

describe('WorldPreview', () => {
  it('passes the last valid template to the player after the debounce', () => {
    const first = setName(NEON_NOCTURNE, 'One');
    const second = setName(NEON_NOCTURNE, 'Two');
    const { rerender } = render(<WorldPreview state={{ lastValid: first }} projectId={null} />);
    expect(seen.at(-1)).toBe(first);
    rerender(<WorldPreview state={{ lastValid: second }} projectId={null} />);
    expect(seen.at(-1)).toBe(first); // not yet
    act(() => void vi.advanceTimersByTime(299));
    expect(seen.at(-1)).toBe(first);
    act(() => void vi.advanceTimersByTime(1));
    expect(seen.at(-1)).toBe(second);
  });

  it('keeps the previous template while the lastValid does not change (invalid draft)', () => {
    const valid = setName(NEON_NOCTURNE, 'Valid');
    const { rerender } = render(<WorldPreview state={{ lastValid: valid }} projectId={null} />);
    rerender(<WorldPreview state={{ lastValid: valid }} projectId={null} />);
    act(() => void vi.advanceTimersByTime(1000));
    expect(new Set(seen).size).toBe(1);
  });
});
