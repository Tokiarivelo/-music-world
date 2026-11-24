/**
 * Keyboard bindings of the immersive session (the VR twin of the desktop navigation keys). Pure state plus a window
 * binding. They follow the IWER emulator's own mapping (W A S D = left thumbstick, ← → = right thumbstick, Q E = left
 * trigger / squeeze) and add what a Quest with a Bluetooth keyboard needs:
 *
 *   W A S D      glide (left stick)        ← → or Q E   snap turn (right stick)
 *   Space        play / pause              [ ]          seek back / forward
 *   R            recenter the panel        G or B       diorama / world around you (the B / Y button)
 *
 * The locomotion system merges these with the controller sticks by taking the larger value on each axis, so in the
 * emulator, where the same keys also drive the emulated sticks, nothing moves twice.
 */
import { VR_STICK_DEADZONE } from './constants';
import type { Stick } from './locomotion';

export type KeyboardEdge = 'toggle' | 'seekBack' | 'seekForward' | 'recenter' | 'scale';

const EDGE_KEYS: Readonly<Record<string, KeyboardEdge>> = {
  Space: 'toggle',
  BracketLeft: 'seekBack',
  BracketRight: 'seekForward',
  KeyR: 'recenter',
  KeyG: 'scale',
  KeyB: 'scale',
};
const HELD_KEYS: ReadonlySet<string> = new Set([
  'KeyW', 'KeyA', 'KeyS', 'KeyD', 'KeyQ', 'KeyE', 'ArrowLeft', 'ArrowRight',
]);

export function isEditableElement(target: EventTarget | null): boolean {
  const el = target as { tagName?: string; isContentEditable?: boolean } | null;
  return !!el && (el.tagName === 'INPUT' || el.tagName === 'TEXTAREA' || el.tagName === 'SELECT' || el.isContentEditable === true);
}

export class KeyboardPad {
  private readonly held = new Set<string>();
  private readonly edges: KeyboardEdge[] = [];

  /** Left stick from W A S D (forward is y < 0, like a gamepad). */
  stick(): Stick {
    const x = (this.held.has('KeyD') ? 1 : 0) - (this.held.has('KeyA') ? 1 : 0);
    const y = (this.held.has('KeyS') ? 1 : 0) - (this.held.has('KeyW') ? 1 : 0);
    return { x, y };
  }

  /** Turn axis from ← → and Q E (−1 left, +1 right). */
  turn(): number {
    const right = this.held.has('ArrowRight') || this.held.has('KeyE');
    const left = this.held.has('ArrowLeft') || this.held.has('KeyQ');
    return (right ? 1 : 0) - (left ? 1 : 0);
  }

  /** Edge commands pressed since the last call (cleared). */
  takeEdges(): KeyboardEdge[] {
    return this.edges.length === 0 ? this.edges : this.edges.splice(0);
  }

  keyDown(code: string, repeat = false): void {
    if (HELD_KEYS.has(code)) this.held.add(code);
    const edge = EDGE_KEYS[code];
    if (edge && !repeat) this.edges.push(edge);
  }

  keyUp(code: string): void {
    this.held.delete(code);
  }

  clear(): void {
    this.held.clear();
    this.edges.length = 0;
  }

  /**
   * Listens on a window until the returned function is called. Ignores text fields, Ctrl / Alt / Meta shortcuts and
   * everything while `isActive()` is false (outside the immersive session the keys belong to the page).
   */
  attach(win: Pick<Window, 'addEventListener' | 'removeEventListener'> = window, isActive: () => boolean = () => true): () => void {
    const down = (e: KeyboardEvent): void => {
      if (!isActive() || e.ctrlKey || e.altKey || e.metaKey || isEditableElement(e.target)) return;
      this.keyDown(e.code, e.repeat);
      if (e.code === 'Space') e.preventDefault(); // the page must not scroll or press a focused button
    };
    const up = (e: KeyboardEvent): void => this.keyUp(e.code);
    const blur = (): void => this.clear();
    win.addEventListener('keydown', down as EventListener);
    win.addEventListener('keyup', up as EventListener);
    win.addEventListener('blur', blur);
    return () => {
      win.removeEventListener('keydown', down as EventListener);
      win.removeEventListener('keyup', up as EventListener);
      win.removeEventListener('blur', blur);
      this.clear();
    };
  }
}

/** The one pad of the page; the host attaches it, the XR systems read it. */
export const keyboardPad = new KeyboardPad();

/** The stronger of a controller axis and a keyboard axis (so the same input read twice does not add up). */
export function mergeAxis(pad: number, key: number): number {
  return Math.abs(key) > Math.abs(pad) ? key : pad;
}

export function mergeStick(pad: Stick, key: Stick): Stick {
  return { x: mergeAxis(pad.x, key.x), y: mergeAxis(pad.y, key.y) };
}

export const KEY_STICK_ACTIVE = VR_STICK_DEADZONE;
