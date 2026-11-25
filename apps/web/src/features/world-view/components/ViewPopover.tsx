"use client";

import { useState } from "react";
import { LANDSCAPE_IDS } from "@/engine/landscapes";
import { LAYOUT_MODES } from "@/engine/layout";
import { TIME_MODES, WEATHER_MODES } from "@/engine/weather";
import { useT } from "@/i18n";
import type { ViewPrefs } from "../lib/view-storage";

interface ViewPopoverProps {
  prefs: ViewPrefs;
  onChange(patch: Partial<ViewPrefs>): void;
}

const BUTTON =
  "rounded-full border border-white/20 bg-black/50 px-4 py-2 text-sm text-white backdrop-blur " +
  "focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--mw-accent)]";
const ACTIVE = "bg-[var(--mw-accent)] text-black";

/** "View" popover: how the structures are arranged, and the northern-lights mode where notes hang in the sky. */
export function ViewPopover({ prefs, onChange }: ViewPopoverProps) {
  const t = useT("world");
  const [open, setOpen] = useState(false);
  return (
    <div className="absolute bottom-28 left-[14rem] z-10 flex max-w-[calc(100%-15rem)] flex-col items-start gap-2">
      {open && (
        <section
          aria-label={t("view.title")}
          className="max-h-[calc(100vh-13rem)] w-72 max-w-full space-y-3 overflow-y-auto rounded-2xl border border-white/20 bg-black/70 p-4 text-sm text-white backdrop-blur"
          onKeyDown={(e) => {
            if (e.key === "Escape") setOpen(false);
          }}
        >
          <button
            aria-pressed={prefs.dome}
            className={`${BUTTON} w-full text-left ${prefs.dome ? ACTIVE : ""}`}
            onClick={() => onChange({ dome: !prefs.dome })}
            type="button"
          >
            {t("view.dome")}
          </button>
          <p className="px-1 text-xs text-white/80">{t("view.domeHint")}</p>
          {prefs.dome && (
            <div aria-label={t("view.landscape")} className="flex flex-wrap gap-2" role="group">
              {LANDSCAPE_IDS.map((id) => (
                <button
                  aria-pressed={prefs.landscape === id}
                  className={`${BUTTON} ${prefs.landscape === id ? ACTIVE : ""}`}
                  key={id}
                  onClick={() => onChange({ landscape: id })}
                  type="button"
                >
                  {t(`view.landscape.${id}`)}
                </button>
              ))}
            </div>
          )}
          <button
            aria-pressed={prefs.aurora}
            className={`${BUTTON} w-full text-left ${prefs.aurora ? ACTIVE : ""}`}
            onClick={() => onChange({ aurora: !prefs.aurora })}
            type="button"
          >
            {t("view.aurora")}
          </button>
          <p className="px-1 text-xs text-white/80">{t("view.auroraHint")}</p>
          <div aria-label={t("view.layout")} className="flex flex-wrap gap-2" role="group">
            {LAYOUT_MODES.map((id) => (
              <button
                aria-pressed={prefs.layout === id}
                className={`${BUTTON} ${prefs.layout === id ? ACTIVE : ""}`}
                key={id}
                onClick={() => onChange({ layout: id })}
                type="button"
              >
                {t(`view.layout.${id}`)}
              </button>
            ))}
          </div>
          <div aria-label={t("view.weather")} className="flex flex-wrap gap-2" role="group">
            {WEATHER_MODES.map((id) => (
              <button
                aria-pressed={prefs.weather === id}
                className={`${BUTTON} ${prefs.weather === id ? ACTIVE : ""}`}
                key={id}
                onClick={() => onChange({ weather: id })}
                type="button"
              >
                {t(`view.weather.${id}`)}
              </button>
            ))}
          </div>
          <div aria-label={t("view.time")} className="flex flex-wrap gap-2" role="group">
            {TIME_MODES.map((id) => (
              <button
                aria-pressed={prefs.time === id}
                className={`${BUTTON} ${prefs.time === id ? ACTIVE : ""}`}
                key={id}
                onClick={() => onChange({ time: id })}
                type="button"
              >
                {t(`view.time.${id}`)}
              </button>
            ))}
          </div>
          <button
            aria-pressed={prefs.realSky}
            className={`${BUTTON} w-full text-left ${prefs.realSky ? ACTIVE : ""}`}
            onClick={() => onChange({ realSky: !prefs.realSky })}
            type="button"
          >
            {t("view.realSky")}
          </button>
        </section>
      )}
      <button aria-expanded={open} className={BUTTON} onClick={() => setOpen(!open)} type="button">
        {t("view.title")}
      </button>
    </div>
  );
}
