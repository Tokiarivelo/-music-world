'use client';

import { useEffect, useRef } from 'react';
import { commandFor, isTypingTarget, type WorkspaceCommand } from '../lib/shortcuts';

/** Window key handler of the workspace: maps a key press to a command, never while typing in a field. */
export function useWorkspaceShortcuts(run: (command: WorkspaceCommand) => void, enabled = true): void {
  const latest = useRef(run);
  useEffect(() => {
    latest.current = run;
  });
  useEffect(() => {
    if (!enabled) return;
    const onKey = (e: KeyboardEvent): void => {
      if (isTypingTarget(e.target)) return;
      const command = commandFor(e);
      if (!command) return;
      e.preventDefault();
      latest.current(command);
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [enabled]);
}
