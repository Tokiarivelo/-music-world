/**
 * View state of the note editor (I9): which note is hovered or selected and where the drag ghost is. Shared by the
 * edit controller (writer) and the staff view (reader), like `layerStore`. Never part of the world state.
 */
export interface EditViewState {
  readonly enabled: boolean;
  readonly hover: number | null;
  readonly selected: number | null;
  /** Drag target: the note keeps its place in time, only its pitch changes. */
  readonly ghost: { readonly index: number; readonly midi: number } | null;
}

export const EDIT_IDLE: EditViewState = { enabled: false, hover: null, selected: null, ghost: null };

type Listener = (state: EditViewState) => void;

class EditStore {
  private current: EditViewState = EDIT_IDLE;
  private readonly listeners = new Set<Listener>();

  get state(): EditViewState {
    return this.current;
  }

  set(next: Partial<EditViewState>): void {
    const merged = { ...this.current, ...next };
    if (
      merged.enabled === this.current.enabled &&
      merged.hover === this.current.hover &&
      merged.selected === this.current.selected &&
      merged.ghost?.index === this.current.ghost?.index &&
      merged.ghost?.midi === this.current.ghost?.midi
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
