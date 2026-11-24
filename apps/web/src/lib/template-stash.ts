import { TemplateSchema, type Template } from '@/templates/generated';

/** `?from=session` reads the template an "Edit a copy" entry point stashed (read by the editor, overwritten by the next handoff). */
export const HANDOFF_KEY = 'mw.editor.handoff';
/** The editor's unsaved document, kept across the sign-in round trip until it is saved. */
export const UNSAVED_KEY = 'mw.editor.unsaved';

/** A template in `sessionStorage` under `key`; every access is guarded (private windows and blocked storage throw). */
export function stashTemplate(template: Template, key: string, storage: Storage | null = safeStorage()): boolean {
  try {
    storage?.setItem(key, JSON.stringify(template));
    return storage !== null;
  } catch {
    return false;
  }
}

export function readStashedTemplate(key: string, storage: Storage | null = safeStorage()): Template | null {
  try {
    const raw = storage?.getItem(key);
    if (!raw) return null;
    const parsed = TemplateSchema.safeParse(JSON.parse(raw));
    return parsed.success ? parsed.data : null;
  } catch {
    return null;
  }
}

export function clearStashedTemplate(key: string, storage: Storage | null = safeStorage()): void {
  try {
    storage?.removeItem(key);
  } catch {
    // nothing to clear
  }
}

function safeStorage(): Storage | null {
  try {
    return typeof window === 'undefined' ? null : window.sessionStorage;
  } catch {
    return null;
  }
}
