import { TemplateSchema, type Template } from '@/templates/generated';

/** The draft map kept in this browser (`localStorage`), so a reload or a sign-in round trip loses nothing. */
export const MAP_DRAFT_KEY = 'mw.map.draft';

interface Stored {
  readonly template: Template;
  /** Id of the saved store draft this map came from or was saved as; null while it was never saved. */
  readonly savedId: string | null;
}

function storage(): Storage | null {
  try {
    return typeof window === 'undefined' ? null : window.localStorage;
  } catch {
    return null;
  }
}

export function saveMapDraft(template: Template, savedId: string | null, store: Storage | null = storage()): boolean {
  try {
    if (!store) return false;
    store.setItem(MAP_DRAFT_KEY, JSON.stringify({ template, savedId }));
    return true;
  } catch {
    return false; // quota, private window or blocked storage: the editor still works
  }
}

/** The raw stored draft (a string, so it is a stable snapshot for `useSyncExternalStore`), or null. */
export function readRawMapDraft(store: Storage | null = storage()): string | null {
  try {
    return store?.getItem(MAP_DRAFT_KEY) ?? null;
  } catch {
    return null;
  }
}

/** A stored draft when it is still a valid template; anything else is ignored. */
export function parseMapDraft(raw: string | null): Stored | null {
  try {
    if (!raw) return null;
    const parsed = JSON.parse(raw) as { template?: unknown; savedId?: unknown };
    const template = TemplateSchema.safeParse(parsed.template);
    if (!template.success) return null;
    return { template: template.data, savedId: typeof parsed.savedId === 'string' ? parsed.savedId : null };
  } catch {
    return null;
  }
}

export function loadMapDraft(store: Storage | null = storage()): Stored | null {
  return parseMapDraft(readRawMapDraft(store));
}

export function clearMapDraft(store: Storage | null = storage()): void {
  try {
    store?.removeItem(MAP_DRAFT_KEY);
  } catch {
    // nothing to clear
  }
}
