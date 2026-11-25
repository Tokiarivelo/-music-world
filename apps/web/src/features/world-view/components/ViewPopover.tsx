"use client";

import { useState } from "react";
import { LAYOUT_MODES } from "@/engine/layout";
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
          className="w-72 max-w-full space-y-3 rounded-2xl border border-white/20 bg-black/70 p-4 text-sm text-white backdrop-blur"
          onKeyDown={(e) => {
            if (e.key === "Escape") setOpen(false);
          }}
        >
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
        </section>
      )}
      <button aria-expanded={open} className={BUTTON} onClick={() => setOpen(!open)} type="button">
        {t("view.title")}
      </button>
    </div>
  );
}
