/** Keyboard shortcuts of the object workspace (Blender-like). Pure: the component maps a command to an edit. */

export type WorkspaceCommand =
  | { type: 'tool'; tool: 'select' | 'translate' | 'rotate' | 'scale' }
  | { type: 'view'; view: 'front' | 'back' | 'left' | 'right' | 'top' | 'bottom' }
  | { type: 'delete' }
  | { type: 'duplicate' }
  | { type: 'hide' }
  | { type: 'showAll' }
  | { type: 'frame' }
  | { type: 'isolate' }
  | { type: 'ortho' }
  | { type: 'snap' }
  | { type: 'space' }
  | { type: 'undo' }
  | { type: 'redo' }
  | { type: 'deselect' }
  | { type: 'help' }
  | { type: 'nudge'; axis: 'x' | 'y' | 'z'; dir: 1 | -1 };

export interface KeyLike {
  readonly key: string;
  readonly code?: string;
  readonly ctrlKey?: boolean;
  readonly metaKey?: boolean;
  readonly shiftKey?: boolean;
  readonly altKey?: boolean;
}

/** Every shortcut with the key shown in the help and on the tool tips. */
export type ShortcutName =
  | 'select' | 'translate' | 'rotate' | 'scale' | 'duplicate' | 'delete' | 'hide' | 'showAll' | 'frame' | 'isolate' | 'viewFront'
  | 'viewSide' | 'viewTop' | 'ortho' | 'snap' | 'space' | 'undo' | 'redo' | 'deselect' | 'help';

export const SHORTCUT_LIST: readonly { keys: string; command: ShortcutName }[] = [
  { keys: 'Q', command: 'select' },
  { keys: 'G', command: 'translate' },
  { keys: 'R', command: 'rotate' },
  { keys: 'S', command: 'scale' },
  { keys: 'Shift+D', command: 'duplicate' },
  { keys: 'X / Del', command: 'delete' },
  { keys: 'H', command: 'hide' },
  { keys: 'Alt+H', command: 'showAll' },
  { keys: 'F', command: 'frame' },
  { keys: '/', command: 'isolate' },
  { keys: '1 / Ctrl+1', command: 'viewFront' },
  { keys: '3 / Ctrl+3', command: 'viewSide' },
  { keys: '7 / Ctrl+7', command: 'viewTop' },
  { keys: '5', command: 'ortho' },
  { keys: 'Shift+S', command: 'snap' },
  { keys: 'T', command: 'space' },
  { keys: 'Ctrl+Z', command: 'undo' },
  { keys: 'Ctrl+Shift+Z', command: 'redo' },
  { keys: 'Esc', command: 'deselect' },
  { keys: '?', command: 'help' },
];

const VIEWS = { '1': ['front', 'back'], '3': ['right', 'left'], '7': ['top', 'bottom'] } as const;

/** The command of a key press, or `null` when it is not a shortcut. Typing in a field never reaches here. */
export function commandFor(e: KeyLike): WorkspaceCommand | null {
  const mod = Boolean(e.ctrlKey || e.metaKey);
  const key = e.key.length === 1 ? e.key.toLowerCase() : e.key;
  if (mod) {
    if (key === 'z') return { type: e.shiftKey ? 'redo' : 'undo' };
    if (key === 'y') return { type: 'redo' };
    if (key in VIEWS) return { type: 'view', view: VIEWS[key as keyof typeof VIEWS][1] };
    return null;
  }
  if (e.altKey) return key === 'h' ? { type: 'showAll' } : null;
  if (e.shiftKey && key === 'd') return { type: 'duplicate' };
  if (e.shiftKey && key === 's') return { type: 'snap' };
  switch (key) {
    case 'q': return { type: 'tool', tool: 'select' };
    case 'g': return { type: 'tool', tool: 'translate' };
    case 'r': return { type: 'tool', tool: 'rotate' };
    case 's': return { type: 'tool', tool: 'scale' };
    case 'x': case 'Delete': case 'Backspace': return { type: 'delete' };
    case 'h': return { type: 'hide' };
    case 'f': return { type: 'frame' };
    case '/': return { type: 'isolate' };
    case '5': return { type: 'ortho' };
    case 't': return { type: 'space' };
    case 'Escape': return { type: 'deselect' };
    case '?': return { type: 'help' };
    case 'ArrowLeft': return { type: 'nudge', axis: 'x', dir: -1 };
    case 'ArrowRight': return { type: 'nudge', axis: 'x', dir: 1 };
    case 'ArrowUp': return { type: 'nudge', axis: e.shiftKey ? 'y' : 'z', dir: -1 };
    case 'ArrowDown': return { type: 'nudge', axis: e.shiftKey ? 'y' : 'z', dir: 1 };
    default:
      if (key in VIEWS) return { type: 'view', view: VIEWS[key as keyof typeof VIEWS][0] };
      return null;
  }
}

/** True for the elements where a key press types text (shortcuts must not fire there). */
export function isTypingTarget(target: EventTarget | null): boolean {
  const el = target as { tagName?: string; isContentEditable?: boolean } | null;
  if (!el?.tagName) return false;
  const tag = el.tagName.toUpperCase();
  return tag === 'INPUT' || tag === 'TEXTAREA' || tag === 'SELECT' || Boolean(el.isContentEditable);
}
