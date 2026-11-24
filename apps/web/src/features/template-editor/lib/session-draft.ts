import { TemplateSchema, type Template } from '@/templates/generated';
import { SESSION_KEY } from '../consts/loader.consts';

/** Unsaved document / handed-over template in `sessionStorage`; every access is guarded (private windows throw). */
export function stashTemplate(template: Template, storage: Storage | null = safeStorage()): boolean {
  try {
    storage?.setItem(SESSION_KEY, JSON.stringify(template));
    return storage !== null;
  } catch {
    return false;
  }
}

export function readStashedTemplate(storage: Storage | null = safeStorage()): Template | null {
  try {
    const raw = storage?.getItem(SESSION_KEY);
    if (!raw) return null;
    const parsed = TemplateSchema.safeParse(JSON.parse(raw));
    return parsed.success ? parsed.data : null;
  } catch {
    return null;
  }
}

export function clearStashedTemplate(storage: Storage | null = safeStorage()): void {
  try {
    storage?.removeItem(SESSION_KEY);
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
