/**
 * View state of the note editor (I9): which notes are hovered or selected and where the drag ghost is. Shared by the
 * edit controller (writer) and the staff view (reader), like `layerStore`. Never part of the world state. Notes are
 * identified by id, not by plan index: the plan is rebuilt after every edit and indices move.
 */
export interface EditViewState {
  readonly enabled: boolean;
  readonly hover: string | null;
  /** Selected note ids; the last one is the primary (the one that is dragged and shown in the panel). */
  readonly selection: readonly string[];
  /** Drag target of the primary note: its new pitch and the shift of its time in seconds (0 = kept). */
  readonly ghost: { readonly noteId: string; readonly midi: number; readonly dt: number } | null;
}

export const EDIT_IDLE: EditViewState = { enabled: false, hover: null, selection: [], ghost: null };

type Listener = (state: EditViewState) => void;

function sameList(a: readonly string[], b: readonly string[]): boolean {
  return a.length === b.length && a.every((x, i) => x === b[i]);
}

class EditStore {
  private current: EditViewState = EDIT_IDLE;
  private readonly listeners = new Set<Listener>();

  get state(): EditViewState {
    return this.current;
  }

  get primary(): string | null {
    return this.current.selection.at(-1) ?? null;
  }

  set(next: Partial<EditViewState>): void {
    const merged = { ...this.current, ...next };
    if (
      merged.enabled === this.current.enabled &&
      merged.hover === this.current.hover &&
      sameList(merged.selection, this.current.selection) &&
      merged.ghost?.noteId === this.current.ghost?.noteId &&
      merged.ghost?.midi === this.current.ghost?.midi &&
      merged.ghost?.dt === this.current.ghost?.dt
    ) {
      return;
    }
    this.current = merged;
    for (const listener of this.listeners) listener(merged);
  }

  reset(): void {
    this.set(EDIT_IDLE);
  }

  subscribe(listener: Listener): () => void {
    this.listeners.add(listener);
    return () => {
      this.listeners.delete(listener);
    };
  }
}

export const editStore = new EditStore();
