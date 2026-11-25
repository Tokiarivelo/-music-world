import { describe, expect, it } from 'vitest';
import { NavigationInput, bindNavigationInput, emptyDelta, isEditableTarget, wheelFactor } from './navigation-input';

function drain(input: NavigationInput) {
  return input.drain(emptyDelta());
}

describe('NavigationInput', () => {
  it('a left drag orbits, a right or Shift drag pans', () => {
    const input = new NavigationInput();
    input.pointerDown(1, 10, 10, 0, false);
    input.pointerMove(1, 30, 15);
    let d = drain(input);
    expect([d.orbitX, d.orbitY, d.panX, d.panY, d.moved]).toEqual([20, 5, 0, 0, true]);
    input.pointerUp(1);

    input.pointerDown(2, 0, 0, 2, false);
    input.pointerMove(2, -4, 6);
    d = drain(input);
    expect([d.orbitX, d.panX, d.panY]).toEqual([0, -4, 6]);
    input.pointerUp(2);

    input.pointerDown(3, 0, 0, 0, true);
    input.pointerMove(3, 3, 0);
    expect(drain(input).panX).toBe(3);
  });

  it('two pointers pinch-zoom by spread ratio and pan by midpoint', () => {
    const input = new NavigationInput();
    input.pointerDown(1, 0, 0, 0, false);
    input.pointerDown(2, 100, 0, 0, false);
    input.pointerMove(2, 200, 0); // spread 100 → 200, midpoint 50 → 100
    const d = drain(input);
    expect(d.zoom).toBeCloseTo(0.5, 12);
    expect(d.panX).toBe(50);
    expect(d.orbitX).toBe(0);
  });

  it('drain resets the deltas; nothing moved means moved = false', () => {
    const input = new NavigationInput();
    input.wheel(1.2);
    expect(drain(input).zoom).toBeCloseTo(1.2, 12);
    const d = drain(input);
    expect([d.zoom, d.moved]).toEqual([1, false]);
  });

  it('maps held keys to fly axes and clears them on blur', () => {
    const input = new NavigationInput();
    for (const code of ['KeyW', 'KeyD', 'KeyQ', 'Equal', 'ShiftLeft']) input.key(code, true);
    input.key('KeyX', true); // not a navigation key
    let d = drain(input);
    expect(d.keys).toEqual({ forward: 1, right: 1, turn: -1, tilt: 0, zoom: 1, fast: true });
    expect(d.moved).toBe(true);
    input.key('KeyW', false);
    expect(drain(input).keys.forward).toBe(0);
    input.clear();
    d = drain(input);
    expect(d.keys).toEqual({ forward: 0, right: 0, turn: 0, tilt: 0, zoom: 0, fast: false });
    expect(d.moved).toBe(false);
  });

  it('ignores moves of unknown pointers and tracks dragging', () => {
    const input = new NavigationInput();
    input.pointerMove(9, 10, 10);
    expect(drain(input).moved).toBe(false);
    input.pointerDown(1, 0, 0, 0, false);
    expect(input.dragging).toBe(true);
    input.pointerUp(1);
    expect(input.dragging).toBe(false);
  });
});

describe('isEditableTarget', () => {
  it('is true for text fields, textareas, selects and editable elements only', () => {
    const text = document.createElement('input');
    const range = document.createElement('input');
    range.type = 'range';
    const editable = document.createElement('div');
    editable.contentEditable = 'true';
    // jsdom does not implement isContentEditable.
    Object.defineProperty(editable, 'isContentEditable', { value: true });
    expect(isEditableTarget(text)).toBe(true);
    expect(isEditableTarget(document.createElement('textarea'))).toBe(true);
    expect(isEditableTarget(document.createElement('select'))).toBe(true);
    expect(isEditableTarget(editable)).toBe(true);
    expect(isEditableTarget(range)).toBe(false);
    expect(isEditableTarget(document.createElement('button'))).toBe(false);
    expect(isEditableTarget(document.body)).toBe(false);
    expect(isEditableTarget(null)).toBe(false);
    expect(isEditableTarget(window)).toBe(false);
  });
});

describe('wheelFactor', () => {
  it('zooms out on positive delta, in on negative, and normalizes line / page modes', () => {
    expect(wheelFactor(100, 0, 0.001)).toBeGreaterThan(1);
    expect(wheelFactor(-100, 0, 0.001)).toBeLessThan(1);
    expect(wheelFactor(1, 1, 0.001)).toBeCloseTo(wheelFactor(16, 0, 0.001), 12);
    expect(wheelFactor(1e6, 0, 0.001)).toBeCloseTo(Math.exp(0.4), 12);
  });
});

function pointer(type: string, init: { id: number; x: number; y: number; button?: number }): Event {
  const event = new MouseEvent(type, { clientX: init.x, clientY: init.y, button: init.button ?? 0, bubbles: true });
  Object.defineProperty(event, 'pointerId', { value: init.id });
  return event;
}

describe('bindNavigationInput', () => {
  function setup(enabled = true) {
    const canvas = document.createElement('canvas');
    document.body.appendChild(canvas);
    const input = new NavigationInput();
    const state = { enabled };
    const unbind = bindNavigationInput(canvas, input, () => state.enabled, { wheelPerPixel: 0.001 });
    return { canvas, input, state, unbind };
  }

  it('feeds pointer drags, wheel and keys while enabled, and blocks page scroll and context menu', () => {
    const { canvas, input, unbind } = setup();
    canvas.dispatchEvent(pointer('pointerdown', { id: 1, x: 0, y: 0 }));
    canvas.dispatchEvent(pointer('pointermove', { id: 1, x: 12, y: 0 }));
    canvas.dispatchEvent(pointer('pointerup', { id: 1, x: 12, y: 0 }));
    const wheel = new WheelEvent('wheel', { deltaY: 100, cancelable: true });
    canvas.dispatchEvent(wheel);
    const menu = new MouseEvent('contextmenu', { cancelable: true });
    canvas.dispatchEvent(menu);
    window.dispatchEvent(new KeyboardEvent('keydown', { code: 'KeyW' }));
    const d = input.drain(emptyDelta());
    expect(d.orbitX).toBe(12);
    expect(d.zoom).toBeGreaterThan(1);
    expect(d.keys.forward).toBe(1);
    expect(wheel.defaultPrevented).toBe(true);
    expect(menu.defaultPrevented).toBe(true);
    window.dispatchEvent(new Event('blur'));
    expect(input.drain(emptyDelta()).keys.forward).toBe(0);
    unbind();
  });

  it('ignores input while disabled and leaves the page behaviour alone', () => {
    const { canvas, input, unbind } = setup(false);
    canvas.dispatchEvent(pointer('pointerdown', { id: 1, x: 0, y: 0 }));
    canvas.dispatchEvent(pointer('pointermove', { id: 1, x: 12, y: 0 }));
    const wheel = new WheelEvent('wheel', { deltaY: 100, cancelable: true });
    canvas.dispatchEvent(wheel);
    window.dispatchEvent(new KeyboardEvent('keydown', { code: 'KeyW' }));
    const d = input.drain(emptyDelta());
    expect(d.moved).toBe(false);
    expect(wheel.defaultPrevented).toBe(false);
    unbind();
  });

  it('ignores keys typed in a text field or with Ctrl / Alt / Meta', () => {
    const { input, unbind } = setup();
    const field = document.createElement('input');
    document.body.appendChild(field);
    field.dispatchEvent(new KeyboardEvent('keydown', { code: 'KeyW', bubbles: true }));
    window.dispatchEvent(new KeyboardEvent('keydown', { code: 'KeyD', ctrlKey: true }));
    expect(input.drain(emptyDelta()).moved).toBe(false);
    unbind();
  });

  it('removes every listener on unbind', () => {
    const { canvas, input, unbind } = setup();
    unbind();
    canvas.dispatchEvent(pointer('pointerdown', { id: 1, x: 0, y: 0 }));
    canvas.dispatchEvent(pointer('pointermove', { id: 1, x: 12, y: 0 }));
    window.dispatchEvent(new KeyboardEvent('keydown', { code: 'KeyW' }));
    expect(input.drain(emptyDelta()).moved).toBe(false);
  });
});

describe('look without a button (pointer lock, I29)', () => {
  it('turns relative mouse motion into look deltas and arrow keys into turn and tilt', () => {
    const input = new NavigationInput();
    input.look(12, -5);
    input.key('ArrowLeft', true);
    input.key('ArrowUp', true);
    const d = drain(input);
    expect([d.orbitX, d.orbitY, d.moved]).toEqual([12, -5, true]);
    expect([d.keys.turn, d.keys.tilt]).toEqual([-1, 1]);
  });
});

describe('pointer lock look in the walk mode (I29)', () => {
  it('a right press locks the pointer only while walking, and locked motion turns the head', () => {
    const canvas = document.createElement('canvas');
    document.body.appendChild(canvas);
    let locks = 0;
    canvas.requestPointerLock = () => {
      locks += 1;
      return Promise.resolve();
    };
    const input = new NavigationInput();
    const walking = { on: false };
    const unbind = bindNavigationInput(canvas, input, () => true, { wheelPerPixel: 0.001, lockLook: (button) => walking.on && button === 2 });
    const press = (button: number) => {
      const e = new MouseEvent('pointerdown', { button, bubbles: true }) as PointerEvent;
      Object.defineProperty(e, 'pointerId', { value: 1 });
      Object.defineProperty(e, 'pointerType', { value: 'mouse' });
      canvas.dispatchEvent(e);
    };
    press(2);
    expect(locks).toBe(0); // explore mode: the right button still pans
    input.clear();
    walking.on = true;
    press(2);
    expect(locks).toBe(1);
    Object.defineProperty(document, 'pointerLockElement', { value: canvas, configurable: true });
    const move = new MouseEvent('pointermove', { bubbles: true }) as PointerEvent;
    Object.defineProperty(move, 'pointerId', { value: 1 });
    Object.defineProperty(move, 'movementX', { value: 30 });
    Object.defineProperty(move, 'movementY', { value: -10 });
    canvas.dispatchEvent(move);
    Object.defineProperty(document, 'pointerLockElement', { value: null, configurable: true });
    const d = input.drain(emptyDelta());
    expect([d.orbitX, d.orbitY]).toEqual([30, -10]);
    unbind();
  });
});
