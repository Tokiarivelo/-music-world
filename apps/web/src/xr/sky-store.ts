/**
 * Aurora sky mode of the viewer (northern lights): view state shared by the views of one page, like `layerStore`. When
 * on, the notes hang in the sky as light on aurora curtains instead of sliding along the staff and falling; a paused
 * song shows them all, and each one can be picked. Never part of the world state or of a template.
 */
type Listener = (enabled: boolean) => void;

class SkyStore {
  private on = false;
  private readonly listeners = new Set<Listener>();

  get enabled(): boolean {
    return this.on;
  }

  set(enabled: boolean): void {
    if (enabled === this.on) return;
    this.on = enabled;
    for (const listener of this.listeners) listener(enabled);
  }

  subscribe(listener: Listener): () => void {
    this.listeners.add(listener);
    return () => {
      this.listeners.delete(listener);
    };
  }
}

export const skyStore = new SkyStore();
