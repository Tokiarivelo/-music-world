/**
 * Hidden layers of the viewer (I5): view state shared by the views of one page, like `scaleStore`. Views read it in
 * `update` and subscribe to know when to redraw even if the song is paused. Never part of the world state.
 */
import { NOTHING_HIDDEN, type HiddenLayers } from '@/engine/layers';

type Listener = (hidden: HiddenLayers) => void;

class LayerStore {
  private current: HiddenLayers = NOTHING_HIDDEN;
  private readonly listeners = new Set<Listener>();

  get hidden(): HiddenLayers {
    return this.current;
  }

  set(hidden: HiddenLayers): void {
    if (hidden === this.current) return;
    this.current = hidden;
    for (const listener of this.listeners) listener(hidden);
  }

  subscribe(listener: Listener): () => void {
    this.listeners.add(listener);
    return () => {
      this.listeners.delete(listener);
    };
  }
}

export const layerStore = new LayerStore();
