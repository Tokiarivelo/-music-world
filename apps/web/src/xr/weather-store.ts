/**
 * Weather mode of the viewer (`auto` follows the music): view state shared by the views of one page, like `skyStore`.
 * Never part of the world state or of a template.
 */
import { DEFAULT_WEATHER, type WeatherMode } from '@/engine/weather';

type Listener = (mode: WeatherMode) => void;

class WeatherStore {
  private current: WeatherMode = DEFAULT_WEATHER;
  private readonly listeners = new Set<Listener>();

  get mode(): WeatherMode {
    return this.current;
  }

  set(mode: WeatherMode): void {
    if (mode === this.current) return;
    this.current = mode;
    for (const listener of this.listeners) listener(mode);
  }

  subscribe(listener: Listener): () => void {
    this.listeners.add(listener);
    return () => {
      this.listeners.delete(listener);
    };
  }
}

export const weatherStore = new WeatherStore();
