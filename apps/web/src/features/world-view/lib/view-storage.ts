import { DEFAULT_WEATHER, isWeatherMode, type WeatherMode } from "@/engine/weather";
import { DEFAULT_LAYOUT, isLayoutMode, type LayoutMode } from "@/engine/layout";

/** View choices are a preference of the browser: one key, every storage access in try / catch. */
export const VIEW_STORAGE_KEY = "mw.view";

export interface ViewPrefs {
  layout: LayoutMode;
  aurora: boolean;
  weather: WeatherMode;
}

export const DEFAULT_VIEW: ViewPrefs = { layout: DEFAULT_LAYOUT, aurora: false, weather: DEFAULT_WEATHER };

export function loadViewPrefs(): ViewPrefs {
  try {
    const raw = typeof localStorage === "undefined" ? null : localStorage.getItem(VIEW_STORAGE_KEY);
    const v = raw ? (JSON.parse(raw) as Partial<ViewPrefs>) : {};
    return { layout: isLayoutMode(v.layout) ? v.layout : DEFAULT_LAYOUT, aurora: v.aurora === true, weather: isWeatherMode(v.weather) ? v.weather : DEFAULT_WEATHER };
  } catch {
    return DEFAULT_VIEW;
  }
}

export function saveViewPrefs(prefs: ViewPrefs): void {
  try {
    localStorage.setItem(VIEW_STORAGE_KEY, JSON.stringify(prefs));
  } catch {
    // private window or blocked storage: the choice only lasts for this page
  }
}
