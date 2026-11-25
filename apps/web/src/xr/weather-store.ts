/**
 * Weather, time of day and photographic sky of the viewer (`auto` follows the music): view state shared by the views of
 * one page, like `skyStore`. Never part of the world state or of a template.
 */
import { DEFAULT_TIME, DEFAULT_WEATHER, type TimeMode, type WeatherMode } from '@/engine/weather';

export interface WeatherSettings {
  readonly mode: WeatherMode;
  readonly time: TimeMode;
  /** Photographic sky (used by `polished` templates only; `flat` templates keep their gradient sky). */
  readonly realSky: boolean;
}

type Listener = (settings: WeatherSettings) => void;

class WeatherStore {
  private current: WeatherSettings = { mode: DEFAULT_WEATHER, time: DEFAULT_TIME, realSky: true };
  private readonly listeners = new Set<Listener>();

  get settings(): WeatherSettings {
    return this.current;
  }

  get mode(): WeatherMode {
    return this.current.mode;
  }

  set(mode: WeatherMode): void {
    this.patch({ mode });
  }

  patch(patch: Partial<WeatherSettings>): void {
    const next = { ...this.current, ...patch };
    if (next.mode === this.current.mode && next.time === this.current.time && next.realSky === this.current.realSky) return;
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

export const weatherStore = new WeatherStore();
