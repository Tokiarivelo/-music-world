"use client";

import { useEffect, useState } from "react";
import {
  LAYER_IDS,
  PRESET_IDS,
  STEM_LAYERS,
  presetHidden,
  presetOf,
  toggleLayer,
  type Activity,
  type HiddenLayers,
  type LayerId,
} from "@/engine/layers";
import { useT } from "@/i18n";
import type { Palette } from "@/xr/palette-generator";

interface LayersPopoverProps {
  hidden: HiddenLayers;
  onChange(next: HiddenLayers): void;
  /** Whether the song has lyrics: without them the Lyrics toggle is disabled and says why. */
  hasLyrics: boolean;
  palette: Palette;
  /** Polled for the activity meters (about 10 times a second while the panel is open). */
  activity(): Activity | null;
}

const BUTTON =
  "rounded-full border border-white/20 bg-black/50 px-4 py-2 text-sm text-white backdrop-blur " +
  "focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--mw-accent)] " +
  "disabled:opacity-40";
const ACTIVE = "bg-[var(--mw-accent)] text-black";
export const METER_INTERVAL_MS = 100;
/** Reduced motion (I5 task 5): the meters update a few times a second instead of ten, with no CSS transition. */
export const METER_INTERVAL_REDUCED_MS = 500;

function prefersReducedMotion(): boolean {
  return typeof matchMedia === "function" && matchMedia("(prefers-reduced-motion: reduce)").matches;
}

/** The color a layer wears in the panel: a role of the palette, close to what it shows in the world. */
const SWATCH: Record<LayerId, keyof Palette> = {
  drums: "accent",
  bass: "secondary",
  vocals: "primary",
  other: "staff",
  chords: "accent",
  lyrics: "staff",
  fx: "secondary",
  staff: "staff",
};

/** "Layers" popover (I5): a toggle per stem, chords, lyrics, effects and staff, presets, and a meter per stem. */
export function LayersPopover({ hidden, onChange, hasLyrics, palette, activity }: LayersPopoverProps) {
  const t = useT("world");
  const [open, setOpen] = useState(false);
  const [levels, setLevels] = useState<Activity | null>(null);

  useEffect(() => {
    if (!open) return;
    const every = prefersReducedMotion() ? METER_INTERVAL_REDUCED_MS : METER_INTERVAL_MS;
    const id = setInterval(() => setLevels(activity()), every);
    return () => clearInterval(id);
  }, [open, activity]);

  const preset = presetOf(hidden);
  return (
    <div className="absolute bottom-28 left-[8.5rem] z-10 flex max-w-[calc(100%-9.5rem)] flex-col items-start gap-2">
      {open && (
        <section
          aria-label={t("layers.title")}
          className="max-h-[calc(100vh-21rem)] w-72 max-w-full space-y-3 overflow-y-auto rounded-2xl border border-white/20 bg-black/70 p-4 text-sm text-white backdrop-blur"
          onKeyDown={(e) => {
            if (e.key === "Escape") setOpen(false);
          }}
        >
          <div aria-label={t("layers.presets")} className="flex flex-wrap gap-2" role="group">
            {PRESET_IDS.map((id) => (
              <button
                aria-pressed={preset === id}
                className={`${BUTTON} ${preset === id ? ACTIVE : ""}`}
                key={id}
                onClick={() => onChange(presetHidden(id))}
                type="button"
              >
                {t(`layers.preset.${id}`)}
              </button>
            ))}
          </div>
          <ul className="space-y-2">
            {LAYER_IDS.map((id) => {
              const disabled = id === "lyrics" && !hasLyrics;
              const shown = !hidden.has(id) && !disabled;
              const level = (STEM_LAYERS as readonly string[]).includes(id) ? levels?.[id as keyof Activity] ?? 0 : null;
              return (
                <li className="space-y-1" key={id}>
                  <button
                    aria-pressed={shown}
                    className={`${BUTTON} flex w-full items-center gap-3 text-left ${shown ? "" : "opacity-60"}`}
                    disabled={disabled}
                    onClick={() => onChange(toggleLayer(hidden, id))}
                    type="button"
                  >
                    <span aria-hidden className="h-4 w-4 shrink-0 rounded-full border border-white/40" style={{ background: palette[SWATCH[id]] }} />
                    <span className="flex-1">{t(`layer.${id}`)}</span>
                    {level !== null && (
                      <span aria-hidden className="h-1.5 w-12 overflow-hidden rounded bg-white/20">
                        <span className="block h-full bg-[var(--mw-accent)]" style={{ width: `${Math.round(level * 100)}%` }} />
                      </span>
                    )}
                  </button>
                  {disabled && <p className="px-2 text-xs text-white/70">{t("layers.noLyrics")}</p>}
                </li>
              );
            })}
          </ul>
        </section>
      )}
      <button aria-expanded={open} className={BUTTON} onClick={() => setOpen(!open)} type="button">
        {t("layers.title")}
      </button>
    </div>
  );
}
