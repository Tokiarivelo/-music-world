import { afterEach, describe, expect, it, vi } from 'vitest';
import { installScrollbarAutoHide, SCROLLING_CLASS } from './scrollbar-autohide';

afterEach(() => vi.useRealTimers());

describe('installScrollbarAutoHide', () => {
  it('shows the scrollbar of the element that scrolls, then hides it after a pause', () => {
    vi.useFakeTimers();
    const dispose = installScrollbarAutoHide(document, 500);
    const box = document.createElement('div');
    document.body.append(box);
    box.dispatchEvent(new Event('scroll'));
    expect(box.classList.contains(SCROLLING_CLASS)).toBe(true);
    vi.advanceTimersByTime(300);
    box.dispatchEvent(new Event('scroll')); // still scrolling: the delay restarts
    vi.advanceTimersByTime(300);
    expect(box.classList.contains(SCROLLING_CLASS)).toBe(true);
    vi.advanceTimersByTime(300);
    expect(box.classList.contains(SCROLLING_CLASS)).toBe(false);
    dispose();
    box.remove();
  });

  it('handles the page scroll and cleans up', () => {
    vi.useFakeTimers();
    const dispose = installScrollbarAutoHide(document, 500);
    document.dispatchEvent(new Event('scroll'));
    expect(document.documentElement.classList.contains(SCROLLING_CLASS)).toBe(true);
    dispose();
    expect(document.documentElement.classList.contains(SCROLLING_CLASS)).toBe(false);
  });
});
