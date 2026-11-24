import { describe, expect, it, vi } from 'vitest';
import { KeyboardPad, mergeAxis, mergeStick } from './keyboard-pad';

describe('VR keyboard bindings', () => {
  it('W A S D give a stick with forward = −y, opposite keys cancel', () => {
    const pad = new KeyboardPad();
    pad.keyDown('KeyW');
    pad.keyDown('KeyD');
    expect(pad.stick()).toEqual({ x: 1, y: -1 });
    pad.keyDown('KeyS');
    expect(pad.stick().y).toBe(0);
    pad.keyUp('KeyW');
    pad.keyUp('KeyS');
    pad.keyUp('KeyD');
    expect(pad.stick()).toEqual({ x: 0, y: 0 });
  });

  it('arrows and Q E turn, in both directions', () => {
    const pad = new KeyboardPad();
    pad.keyDown('ArrowRight');
    expect(pad.turn()).toBe(1);
    pad.keyDown('KeyQ');
    expect(pad.turn()).toBe(0);
    pad.keyUp('ArrowRight');
    expect(pad.turn()).toBe(-1);
  });

  it('command keys fire once per press, not on key repeat, and are taken once', () => {
    const pad = new KeyboardPad();
    pad.keyDown('Space');
    pad.keyDown('Space', true);
    pad.keyDown('BracketRight');
    pad.keyDown('KeyG');
    pad.keyDown('KeyB');
    expect(pad.takeEdges()).toEqual(['toggle', 'seekForward', 'scale', 'scale']);
    expect(pad.takeEdges()).toEqual([]);
    pad.keyDown('KeyR');
    pad.keyDown('BracketLeft');
    expect(pad.takeEdges()).toEqual(['recenter', 'seekBack']);
  });

  it('the stronger of the controller and the keyboard wins, so the emulator does not move twice', () => {
    expect(mergeAxis(1, 1)).toBe(1);
    expect(mergeAxis(0.4, 1)).toBe(1);
    expect(mergeAxis(-0.8, 0)).toBe(-0.8);
    expect(mergeStick({ x: 0, y: -1 }, { x: 0, y: -1 })).toEqual({ x: 0, y: -1 });
  });

  it('attached to a window it listens only while active and not in a text field', () => {
    const handlers = new Map<string, (e: unknown) => void>();
    const win = {
      addEventListener: (t: string, h: (e: unknown) => void) => handlers.set(t, h),
      removeEventListener: (t: string) => handlers.delete(t),
    };
    let active = false;
    const pad = new KeyboardPad();
    const detach = pad.attach(win as unknown as Window, () => active);
    const press = (code: string, extra: Record<string, unknown> = {}) => {
      const preventDefault = vi.fn();
      handlers.get('keydown')!({ code, repeat: false, ctrlKey: false, altKey: false, metaKey: false, target: {}, preventDefault, ...extra });
      return preventDefault;
    };
    press('KeyW');
    expect(pad.stick().y).toBe(0); // not in a VR session: the page owns the keys
    active = true;
    expect(press('Space')).toHaveBeenCalled();
    press('KeyW');
    expect(pad.stick().y).toBe(-1);
    press('KeyA', { target: { tagName: 'INPUT' } });
    expect(pad.stick().x).toBe(0);
    press('KeyD', { ctrlKey: true });
    expect(pad.stick().x).toBe(0);
    handlers.get('blur')!({});
    expect(pad.stick()).toEqual({ x: 0, y: 0 });
    detach();
    expect(handlers.size).toBe(0);
  });
});
