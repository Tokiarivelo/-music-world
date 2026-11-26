export type WorkspaceIconName =
  | 'select' | 'translate' | 'rotate' | 'scale' | 'add' | 'duplicate' | 'delete' | 'mirror' | 'array' | 'hide' | 'show' | 'floor'
  | 'center' | 'frame' | 'isolate' | 'reset' | 'help' | 'close' | 'undo' | 'redo';

/** 24x24 stroke paths; one glyph per tool so the toolbar reads at a glance (decorative: the button carries the label). */
const PATHS: Readonly<Record<WorkspaceIconName, string>> = {
  select: 'M5 3l13 8-6 1.5L9.5 19z',
  translate: 'M12 3v18M3 12h18M12 3l-3 3M12 3l3 3M12 21l-3-3M12 21l3-3M3 12l3-3M3 12l3 3M21 12l-3-3M21 12l-3 3',
  rotate: 'M20 12a8 8 0 1 1-2.5-5.8M20 4v5h-5',
  scale: 'M4 20V10h10v10zM14 10l6-6M14 4h6v6',
  add: 'M12 5v14M5 12h14',
  duplicate: 'M8 8h11v11H8zM5 16V5h11',
  delete: 'M5 7h14M9 7V4h6v3M7 7l1 13h8l1-13',
  mirror: 'M12 3v18M8 7l-5 5 5 5zM16 7l5 5-5 5z',
  array: 'M3 8h5v8H3zM10 8h5v8h-5zM17 8h4v8h-4z',
  hide: 'M3 12s3.5-6 9-6 9 6 9 6-3.5 6-9 6-9-6-9-6zM4 4l16 16',
  show: 'M3 12s3.5-6 9-6 9 6 9 6-3.5 6-9 6-9-6-9-6zM12 9.5a2.5 2.5 0 1 0 0 5 2.5 2.5 0 0 0 0-5z',
  floor: 'M12 3v11M8 10l4 4 4-4M4 20h16',
  center: 'M12 3v18M3 12h18M12 9a3 3 0 1 0 0 6 3 3 0 0 0 0-6z',
  frame: 'M4 9V4h5M15 4h5v5M20 15v5h-5M9 20H4v-5',
  isolate: 'M12 4l7 4v8l-7 4-7-4V8zM12 12l7-4M12 12v8M12 12L5 8',
  reset: 'M4 12a8 8 0 1 1 2.5 5.8M4 20v-5h5',
  help: 'M9.5 9a2.5 2.5 0 1 1 3.5 2.3c-.7.4-1 1-1 1.7M12 17v.5',
  close: 'M6 6l12 12M18 6L6 18',
  undo: 'M9 7L4 12l5 5M4 12h10a6 6 0 0 1 0 12',
  redo: 'M15 7l5 5-5 5M20 12H10a6 6 0 0 0 0 12',
};

export function WorkspaceIcon({ name, size = 20 }: { name: WorkspaceIconName; size?: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.8} strokeLinecap="round" strokeLinejoin="round" aria-hidden focusable="false">
      <path d={PATHS[name]} />
    </svg>
  );
}
