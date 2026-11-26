import { describe, expect, it } from 'vitest';
import * as h from './history';

describe('history', () => {
  it('commits, undoes and redoes', () => {
    let s = h.startHistory(0);
    s = h.commit(s, 1);
    s = h.commit(s, 2);
    expect(s.present).toBe(2);
    s = h.undo(s);
    expect(s.present).toBe(1);
    s = h.redo(s);
    expect(s.present).toBe(2);
    expect(h.canRedo(s)).toBe(false);
  });

  it('a new change clears the redo branch and an identical value is ignored', () => {
    let s = h.commit(h.commit(h.startHistory(0), 1), 2);
    s = h.undo(s);
    s = h.commit(s, 9);
    expect(h.canRedo(s)).toBe(false);
    expect(h.commit(s, 9)).toBe(s);
  });

  it('is a no-op at the ends and bounded', () => {
    const s = h.startHistory('a');
    expect(h.undo(s)).toBe(s);
    expect(h.redo(s)).toBe(s);
    let big = s;
    for (let i = 0; i < h.HISTORY_LIMIT + 20; i += 1) big = h.commit(big, `v${i}`);
    expect(big.past).toHaveLength(h.HISTORY_LIMIT);
  });
});
