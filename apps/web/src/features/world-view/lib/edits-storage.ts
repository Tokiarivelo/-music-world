import { parseEdits, type LayoutEdits } from "@/engine/edits";

/** Note edits of one song, remembered by this browser (I9 requirement 8); every access is in try / catch. */
export const editsStorageKey = (audioHash: string): string => `mw.edits.v1:${audioHash}`;

export function loadEdits(audioHash: string): LayoutEdits | null {
  try {
    const raw = typeof localStorage === "undefined" ? null : localStorage.getItem(editsStorageKey(audioHash));
    return raw ? parseEdits(JSON.parse(raw)) : null;
  } catch {
    return null;
  }
}

export function saveEdits(audioHash: string, edits: LayoutEdits): void {
  try {
    const empty = edits.lines.length === 0 && edits.notes.length === 0 && edits.added.length === 0;
    if (empty) localStorage.removeItem(editsStorageKey(audioHash));
    else localStorage.setItem(editsStorageKey(audioHash), JSON.stringify(edits));
  } catch {
    // private window, blocked or full storage: the edits only last for this page
  }
}

/** Where the signed-in owner's edits of a project live on the server (injected by the page that knows the project). */
export interface EditsRemote {
  load(): Promise<unknown>;
  save(edits: LayoutEdits): Promise<void>;
}
