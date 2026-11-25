/**
 * Dome world of the viewer: no plate, the camera stands inside an infinite-looking dome on a predefined landscape and
 * cannot leave it. View state shared by the views of one page, like `skyStore`. Never part of the world state.
 */
import { DEFAULT_LANDSCAPE, type LandscapeId } from '@/engine/landscapes';

export interface DomeSettings {
  readonly enabled: boolean;
  readonly landscape: LandscapeId;
}

type Listener = (settings: DomeSettings) => void;

class DomeStore {
  private current: DomeSettings = { enabled: false, landscape: DEFAULT_LANDSCAPE };
  private readonly listeners = new Set<Listener>();

  get settings(): DomeSettings {
    return this.current;
  }

  get enabled(): boolean {
    return this.current.enabled;
  }

  set(patch: Partial<DomeSettings>): void {
    const next = { ...this.current, ...patch };
    if (next.enabled === this.current.enabled && next.landscape === this.current.landscape) return;
    this.current = next;
    for (const listener of this.listeners) listener(next);
  }

  subscribe(listener: Listener): () => void {
    this.listeners.add(listener);
    return () => {
      this.listeners.delete(listener);
    };
  }
}

export const domeStore = new DomeStore();
