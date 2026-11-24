"use client";

import { useEffect, useRef, useState, useSyncExternalStore } from "react";
import { useT } from "@/i18n";
import { PALETTE_ROLES } from "@/xr/palette-generator";
import type { Palette } from "@/xr/palette-generator";
import { paletteLink, type PaletteStore } from "../lib/palette-store";

interface ColorsPopoverProps {
  store: PaletteStore;
  /** The template's own colors: what a role shows when it has no override. */
  templatePalette: Palette;
}

const BUTTON =
  "rounded-full border border-white/20 bg-black/50 px-4 py-2 text-sm text-white backdrop-blur " +
  "focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--mw-accent)] " +
  "disabled:opacity-40";

/** "Colors" popover (I4 requirement 1): randomize, undo/redo, per-role lock and color, reset, shareable seed. */
export function ColorsPopover({ store, templatePalette }: ColorsPopoverProps) {
  const t = useT("world");
  const [open, setOpen] = useState(false);
  const [copied, setCopied] = useState(false);
  const state = useSyncExternalStore(store.subscribe, store.getState, store.getState);
  const colors = { ...templatePalette, ...(state.override ?? {}) };

  const copy = async () => {
    if (!state.seed) return;
    try {
      await navigator.clipboard.writeText(paletteLink(location.href, state.seed));
      setCopied(true);
    } catch {
      setCopied(false);
    }
  };

  return (
    <div className="absolute bottom-28 left-4 z-10 flex max-w-[calc(100%-2rem)] flex-col items-start gap-2">
      {open && (
        <section
          aria-label={t("colors.title")}
          className="max-h-[calc(100vh-17rem)] w-72 max-w-full space-y-3 overflow-y-auto rounded-2xl border border-white/20 bg-black/70 p-4 text-sm text-white backdrop-blur"
          onKeyDown={(e) => {
            if (e.key === "Escape") setOpen(false);
          }}
        >
          <div className="flex flex-wrap gap-2">
            <button className={BUTTON} onClick={() => store.randomize()} type="button">
              {t("colors.randomize")}
            </button>
            <button className={BUTTON} disabled={!store.canUndo()} onClick={store.undo} type="button">
              {t("colors.undo")}
            </button>
            <button className={BUTTON} disabled={!store.canRedo()} onClick={store.redo} type="button">
              {t("colors.redo")}
            </button>
          </div>
          <div className="flex items-center justify-between gap-2">
            <span>{state.seed ? t("colors.scheme", { seed: state.seed }) : t("colors.noScheme")}</span>
            {state.seed && (
              <button className={BUTTON} onClick={copy} type="button">
                {copied ? t("colors.copied") : t("colors.copyLink")}
              </button>
            )}
          </div>
          <ul className="space-y-2">
            {PALETTE_ROLES.map((role) => {
              const locked = state.locked.includes(role);
              const label = t(`colors.role.${role}`);
              return (
                <li className="flex items-center gap-3" key={role}>
                  <input
                    aria-label={label}
                    className="h-8 w-10 cursor-pointer rounded border border-white/30 bg-transparent"
                    onChange={(e) => store.setColor(role, e.target.value)}
                    type="color"
                    value={colors[role]}
                  />
                  <span className="flex-1">{label}</span>
                  <button
                    aria-label={t("colors.lock", { role: label })}
                    aria-pressed={locked}
                    className={`${BUTTON} px-3 py-1 ${locked ? "bg-[var(--mw-accent)] text-black" : ""}`}
                    onClick={() => store.toggleLock(role)}
                    type="button"
                  >
                    {locked ? "🔒" : "🔓"}
                  </button>
                </li>
              );
            })}
          </ul>
          <ColorSlider
            label={t("colors.brightness")}
            onCommit={store.setBrightness}
            value={state.brightness}
          />
          <ColorSlider
            label={t("colors.contrast")}
            onCommit={store.setContrast}
            value={state.contrast}
          />
          <button className={BUTTON} onClick={store.reset} type="button">
            {t("colors.reset")}
          </button>
        </section>
      )}
      <button
        aria-expanded={open}
        className={BUTTON}
        onClick={() => setOpen((v) => !v)}
        type="button"
      >
        {t("colors.open")}
      </button>
    </div>
  );
}

/** The slider follows the finger at once; the world (views are rebuilt) is updated once it settles. */
function ColorSlider({ label, value, onCommit }: { label: string; value: number; onCommit: (value: number) => void }) {
  const [draft, setDraft] = useState<number | null>(null);
  const settle = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);
  useEffect(() => () => clearTimeout(settle.current), []);
  return (
    <label className="flex items-center gap-3">
      <span className="w-24">{label}</span>
      <input
        className="flex-1"
        max={1}
        min={-1}
        onChange={(e) => {
          const next = Number(e.target.value);
          setDraft(next);
          clearTimeout(settle.current);
          settle.current = setTimeout(() => {
            onCommit(next);
            setDraft(null);
          }, 120);
        }}
        step={0.05}
        type="range"
        value={draft ?? value}
      />
    </label>
  );
}
