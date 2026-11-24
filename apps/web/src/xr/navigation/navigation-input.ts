/**
 * Navigation input (08-navigation-mode requirements 2, 3): pointer, wheel and key events turned into deltas that the
 * navigation system drains once per frame. `NavigationInput` has no DOM dependency; `bindNavigationInput` attaches it
 * to the canvas and the window.
 */
import type { FlyKeys } from './orbit-camera';

/** Mouse buttons (`PointerEvent.button`). */
const BUTTON_LEFT = 0;

/** Deltas since the last frame, written by `drain` into a caller-owned object (no per-frame allocation). */
export interface NavigationDelta {
  orbitX: number;
  orbitY: number;
  panX: number;
  panY: number;
  /** Multiplicative distance factor (1 = no zoom). */
  zoom: number;
  /** True when the user moved the camera by pointer, wheel or keys since the last drain. */
  moved: boolean;
  keys: FlyKeys;
}

export function emptyDelta(): NavigationDelta {
  return {
    orbitX: 0,
    orbitY: 0,
    panX: 0,
    panY: 0,
    zoom: 1,
    moved: false,
    keys: { forward: 0, right: 0, turn: 0, zoom: 0, fast: false },
  };
}

interface Pointer {
  x: number;
  y: number;
  pan: boolean;
}

/** Codes of the held movement keys (`KeyboardEvent.code`), requirement 3.1. */
const MOVE_KEYS: ReadonlySet<string> = new Set([
  'KeyW',
  'KeyA',
  'KeyS',
  'KeyD',
  'KeyQ',
  'KeyE',
  'Equal',
  'NumpadAdd',
  'Minus',
  'NumpadSubtract',
  'ShiftLeft',
  'ShiftRight',
]);

export function isNavigationKey(code: string): boolean {
  return MOVE_KEYS.has(code);
}

export class NavigationInput {
  private readonly pointers = new Map<number, Pointer>();
  private readonly held = new Set<string>();
  private orbitX = 0;
  private orbitY = 0;
  private panX = 0;
  private panY = 0;
  private zoomFactor = 1;
  private moved = false;
  /** Spread and midpoint of the last two-pointer frame. */
  private spread = 0;
  private midX = 0;
  private midY = 0;

  /** Right / middle button or Shift + left drag pans; left drag orbits (requirement 2.1). */
  pointerDown(id: number, x: number, y: number, button: number, shift: boolean): void {
    this.pointers.set(id, { x, y, pan: button !== BUTTON_LEFT || shift });
    if (this.pointers.size === 2) this.updatePair();
  }

  pointerMove(id: number, x: number, y: number): void {
    const p = this.pointers.get(id);
    if (!p) return;
    const dx = x - p.x;
    const dy = y - p.y;
    p.x = x;
    p.y = y;
    if (this.pointers.size === 1) {
      if (dx === 0 && dy === 0) return;
      if (p.pan) {
        this.panX += dx;
        this.panY += dy;
      } else {
        this.orbitX += dx;
        this.orbitY += dy;
      }
      this.moved = true;
    } else if (this.pointers.size === 2) {
      const prevSpread = this.spread;
      const prevX = this.midX;
      const prevY = this.midY;
      this.updatePair();
      // Two fingers: pinch zooms by spread ratio, the midpoint pans.
      if (prevSpread > 0 && this.spread > 0) this.zoomFactor *= prevSpread / this.spread;
      this.panX += this.midX - prevX;
      this.panY += this.midY - prevY;
      this.moved = true;
    }
  }

  pointerUp(id: number): void {
    this.pointers.delete(id);
    if (this.pointers.size === 2) this.updatePair();
  }

  /** Wheel zoom: positive delta (scroll down) zooms out. */
  wheel(factor: number): void {
    if (!(factor > 0) || factor === 1) return;
    this.zoomFactor *= factor;
    this.moved = true;
  }

  key(code: string, down: boolean): void {
    if (!MOVE_KEYS.has(code)) return;
    if (down) this.held.add(code);
    else this.held.delete(code);
  }

  /** Releases everything: window blur (requirement 3.5), XR session, mode switch. */
  clear(): void {
    this.pointers.clear();
    this.held.clear();
    this.reset();
  }

  /** True while a pointer is down (dragging). */
  get dragging(): boolean {
    return this.pointers.size > 0;
  }

  drain(out: NavigationDelta): NavigationDelta {
    const k = out.keys;
    const has = (code: string): number => (this.held.has(code) ? 1 : 0);
    k.forward = has('KeyW') - has('KeyS');
    k.right = has('KeyD') - has('KeyA');
    k.turn = has('KeyE') - has('KeyQ');
    k.zoom = Math.sign(has('Equal') + has('NumpadAdd')) - Math.sign(has('Minus') + has('NumpadSubtract'));
    k.fast = this.held.has('ShiftLeft') || this.held.has('ShiftRight');
    out.orbitX = this.orbitX;
    out.orbitY = this.orbitY;
    out.panX = this.panX;
    out.panY = this.panY;
    out.zoom = this.zoomFactor;
    out.moved = this.moved || k.forward !== 0 || k.right !== 0 || k.turn !== 0 || k.zoom !== 0;
    this.reset();
    return out;
  }

  private reset(): void {
    this.orbitX = 0;
    this.orbitY = 0;
    this.panX = 0;
    this.panY = 0;
    this.zoomFactor = 1;
    this.moved = false;
  }

  private updatePair(): void {
    const [a, b] = [...this.pointers.values()];
    if (!a || !b) return;
    this.spread = Math.hypot(a.x - b.x, a.y - b.y);
    this.midX = (a.x + b.x) / 2;
    this.midY = (a.y + b.y) / 2;
  }
}

/** True when keyboard shortcuts must not fire: focus in a text field, a select or an editable element (3.3). */
export function isEditableTarget(target: EventTarget | null): boolean {
  if (!target || typeof (target as { tagName?: unknown }).tagName !== 'string') return false;
  const el = target as HTMLElement;
  if (el.isContentEditable) return true;
  const tag = el.tagName;
  if (tag === 'TEXTAREA' || tag === 'SELECT') return true;
  if (tag !== 'INPUT') return false;
  // Buttons and sliders do not take text: the seek slider keeps the camera keys working.
  const type = (el as HTMLInputElement).type;
  return !['button', 'checkbox', 'radio', 'range', 'reset', 'submit', 'color', 'file', 'image'].includes(type);
}

/** Keyboard events with a modifier (except Shift) are left to the browser and the page. */
export function hasCommandModifier(event: Pick<KeyboardEvent, 'ctrlKey' | 'altKey' | 'metaKey'>): boolean {
  return event.ctrlKey || event.altKey || event.metaKey;
}

/** Wheel delta → zoom factor (`deltaMode` 1 = lines, 2 = pages). */
export function wheelFactor(deltaY: number, deltaMode: number, perPixel: number): number {
  const px = deltaMode === 1 ? deltaY * 16 : deltaMode === 2 ? deltaY * 400 : deltaY;
  return Math.exp(Math.max(-400, Math.min(400, px)) * perPixel);
}

/**
 * Attaches the input to the canvas and the window. Events are taken only while `isEnabled()` (explore mode, not in
 * XR); returns the function that removes every listener (requirement 6.3).
 */
export function bindNavigationInput(
  canvas: HTMLElement,
  input: NavigationInput,
  isEnabled: () => boolean,
  options: { wheelPerPixel: number; win?: Window },
): () => void {
  const win = options.win ?? window;
  const down = (e: PointerEvent): void => {
    if (!isEnabled()) return;
    input.pointerDown(e.pointerId, e.clientX, e.clientY, e.button, e.shiftKey);
    canvas.setPointerCapture?.(e.pointerId);
  };
  const move = (e: PointerEvent): void => {
    if (isEnabled()) input.pointerMove(e.pointerId, e.clientX, e.clientY);
  };
  const up = (e: PointerEvent): void => {
    input.pointerUp(e.pointerId);
    if (canvas.hasPointerCapture?.(e.pointerId)) canvas.releasePointerCapture(e.pointerId);
  };
  const wheel = (e: WheelEvent): void => {
    if (!isEnabled()) return;
    e.preventDefault(); // the page must not scroll while zooming the camera
    input.wheel(wheelFactor(e.deltaY, e.deltaMode, options.wheelPerPixel));
  };
  const menu = (e: Event): void => {
    if (isEnabled()) e.preventDefault(); // right-drag pans
  };
  const keyDown = (e: KeyboardEvent): void => {
    if (!isEnabled() || hasCommandModifier(e) || isEditableTarget(e.target) || !isNavigationKey(e.code)) return;
    input.key(e.code, true);
  };
  const keyUp = (e: KeyboardEvent): void => input.key(e.code, false);
  const blur = (): void => input.clear();

  canvas.addEventListener('pointerdown', down);
  canvas.addEventListener('pointermove', move);
  canvas.addEventListener('pointerup', up);
  canvas.addEventListener('pointercancel', up);
  canvas.addEventListener('wheel', wheel, { passive: false });
  canvas.addEventListener('contextmenu', menu);
  win.addEventListener('keydown', keyDown);
  win.addEventListener('keyup', keyUp);
  win.addEventListener('blur', blur);
  return () => {
    canvas.removeEventListener('pointerdown', down);
    canvas.removeEventListener('pointermove', move);
    canvas.removeEventListener('pointerup', up);
    canvas.removeEventListener('pointercancel', up);
    canvas.removeEventListener('wheel', wheel);
    canvas.removeEventListener('contextmenu', menu);
    win.removeEventListener('keydown', keyDown);
    win.removeEventListener('keyup', keyUp);
    win.removeEventListener('blur', blur);
    input.clear();
  };
}
