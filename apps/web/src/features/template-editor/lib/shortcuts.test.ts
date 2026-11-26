import { describe, expect, it } from 'vitest';
import { commandFor, isTypingTarget, SHORTCUT_LIST } from './shortcuts';

describe('shortcuts', () => {
  it('maps the Blender-like keys to tools and edits', () => {
    expect(commandFor({ key: 'g' })).toEqual({ type: 'tool', tool: 'translate' });
    expect(commandFor({ key: 'R' })).toEqual({ type: 'tool', tool: 'rotate' });
    expect(commandFor({ key: 's' })).toEqual({ type: 'tool', tool: 'scale' });
    expect(commandFor({ key: 'x' })).toEqual({ type: 'delete' });
    expect(commandFor({ key: 'Delete' })).toEqual({ type: 'delete' });
    expect(commandFor({ key: 'D', shiftKey: true })).toEqual({ type: 'duplicate' });
    expect(commandFor({ key: 'S', shiftKey: true })).toEqual({ type: 'snap' });
    expect(commandFor({ key: 'a' })).toEqual({ type: 'selectAll' });
  });

  it('undoes and redoes with ctrl or cmd', () => {
    expect(commandFor({ key: 'z', ctrlKey: true })).toEqual({ type: 'undo' });
    expect(commandFor({ key: 'z', metaKey: true, shiftKey: true })).toEqual({ type: 'redo' });
    expect(commandFor({ key: 'y', ctrlKey: true })).toEqual({ type: 'redo' });
    expect(commandFor({ key: 'g', ctrlKey: true })).toBeNull();
  });

  it('picks the camera view, the opposite one with ctrl', () => {
    expect(commandFor({ key: '1' })).toEqual({ type: 'view', view: 'front' });
    expect(commandFor({ key: '1', ctrlKey: true })).toEqual({ type: 'view', view: 'back' });
    expect(commandFor({ key: '7' })).toEqual({ type: 'view', view: 'top' });
    expect(commandFor({ key: '3', ctrlKey: true })).toEqual({ type: 'view', view: 'left' });
  });

  it('nudges with the arrows, up and down with shift', () => {
    expect(commandFor({ key: 'ArrowLeft' })).toEqual({ type: 'nudge', axis: 'x', dir: -1 });
    expect(commandFor({ key: 'ArrowDown' })).toEqual({ type: 'nudge', axis: 'z', dir: 1 });
    expect(commandFor({ key: 'ArrowUp', shiftKey: true })).toEqual({ type: 'nudge', axis: 'y', dir: -1 });
  });

  it('ignores other keys and listed every command once', () => {
    expect(commandFor({ key: 'k' })).toBeNull();
    expect(new Set(SHORTCUT_LIST.map((s) => s.command)).size).toBe(SHORTCUT_LIST.length);
  });

  it('never fires while typing', () => {
    expect(isTypingTarget({ tagName: 'INPUT' } as unknown as EventTarget)).toBe(true);
    expect(isTypingTarget({ tagName: 'SELECT' } as unknown as EventTarget)).toBe(true);
    expect(isTypingTarget({ tagName: 'BUTTON' } as unknown as EventTarget)).toBe(false);
    expect(isTypingTarget(null)).toBe(false);
  });
});
