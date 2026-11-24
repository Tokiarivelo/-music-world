"use client";

import { useState } from "react";
import { MAIN_LINE_ID, noteName, type Clef } from "@/engine/edits";
import { useT } from "@/i18n";
import type { NoteEditsApi } from "../hooks/use-note-edits";

const BUTTON =
  "rounded-full border border-white/20 bg-black/50 px-3 py-1.5 text-sm text-white backdrop-blur " +
  "focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--mw-accent)] " +
  "disabled:opacity-40";
const ACTIVE = "bg-[var(--mw-accent)] text-black";
const FIELD = "w-24 rounded border border-white/20 bg-black/40 px-2 py-1 text-white";
const CLEFS: readonly Clef[] = ["treble", "bass", "none"];
const HEX = /^#[0-9a-fA-F]{6}$/;

function ColorField({ label, value, onChange }: { label: string; value: string | undefined; onChange(hex: string): void }) {
  return (
    <label className="flex items-center gap-2">
      <span className="w-28 shrink-0">{label}</span>
      <input
        aria-label={label}
        className="h-7 w-10 cursor-pointer rounded border border-white/20 bg-transparent"
        onChange={(e) => HEX.test(e.target.value) && onChange(e.target.value)}
        type="color"
        value={value && HEX.test(value) ? value : "#ffffff"}
      />
      <input
        aria-label={`${label} (hex)`}
        className={FIELD}
        defaultValue={value ?? ""}
        key={value}
        maxLength={7}
        onBlur={(e) => HEX.test(e.target.value) && onChange(e.target.value)}
      />
    </label>
  );
}

function NumberField({
  label,
  value,
  min,
  max,
  step,
  onChange,
}: {
  label: string;
  value: number;
  min: number;
  max: number;
  step: number;
  onChange(v: number): void;
}) {
  return (
    <label className="flex items-center gap-2">
      <span className="w-28 shrink-0">{label}</span>
      <input
        className={FIELD}
        max={max}
        min={min}
        onChange={(e) => Number.isFinite(e.target.valueAsNumber) && onChange(e.target.valueAsNumber)}
        step={step}
        type="number"
        value={Number(value.toFixed(3))}
      />
    </label>
  );
}

/** Note editor toolbar (I9): toggle, undo / redo / reset, lines, and the properties of the selected note. */
export function EditToolbar({ api }: { api: NoteEditsApi }) {
  const t = useT("world");
  const [open, setOpen] = useState(false);
  const { selected } = api;
  return (
    <div className="absolute left-[max(1rem,env(safe-area-inset-left))] top-[max(1rem,env(safe-area-inset-top))] z-10 flex max-w-[calc(100%-9rem)] flex-col items-start gap-2">
      <div className="flex flex-wrap items-center gap-2" role="toolbar" aria-label={t("edit.title")}>
        <button
          aria-pressed={api.enabled}
          className={`${BUTTON} ${api.enabled ? ACTIVE : ""}`}
          disabled={!api.paused}
          onClick={() => api.setEnabled(!api.enabled)}
          type="button"
        >
          {t("edit.toggle")}
        </button>
        {api.enabled && (
          <>
            <button className={BUTTON} disabled={!api.canUndo} onClick={api.undo} type="button">
              {t("edit.undo")}
            </button>
            <button className={BUTTON} disabled={!api.canRedo} onClick={api.redo} type="button">
              {t("edit.redo")}
            </button>
            <button className={BUTTON} onClick={api.reset} type="button">
              {t("edit.reset")}
            </button>
            <button aria-expanded={open} className={BUTTON} onClick={() => setOpen(!open)} type="button">
              {t("edit.lines")}
            </button>
          </>
        )}
      </div>
      {!api.paused && <p className="rounded bg-black/50 px-2 py-1 text-xs text-white/80">{t("edit.pauseFirst")}</p>}
      {api.enabled && <p className="rounded bg-black/50 px-2 py-1 text-xs text-white/80">{t("edit.hint")}</p>}
      <p aria-live="polite" className="sr-only" role="status">
        {api.message}
      </p>

      {api.enabled && open && (
        <section aria-label={t("edit.lines")} className="max-h-[50vh] w-80 max-w-full space-y-3 overflow-y-auto rounded-2xl border border-white/20 bg-black/70 p-3 text-sm text-white backdrop-blur">
          <ul className="space-y-3">
            {api.lines.map((line, i) => (
              <li className="space-y-2 rounded-xl border border-white/10 p-2" key={line.id}>
                {line.id === MAIN_LINE_ID ? (
                  <p className="font-medium">{api.lineName(line)}</p>
                ) : (
                  <label className="flex items-center gap-2">
                    <span className="w-28 shrink-0">{t("edit.line.name")}</span>
                    <input
                      className={`${FIELD} w-full`}
                      defaultValue={line.name}
                      maxLength={40}
                      onBlur={(e) => e.target.value.trim() && api.patchLine(line.id, { name: e.target.value.trim() })}
                    />
                  </label>
                )}
                <ColorField label={t("edit.line.color")} onChange={(color) => api.patchLine(line.id, { color })} value={line.color} />
                <label className="flex items-center gap-2">
                  <span className="w-28 shrink-0">{t("edit.line.clef")}</span>
                  <select
                    className={FIELD}
                    onChange={(e) => api.patchLine(line.id, { clef: e.target.value as Clef })}
                    value={line.clef}
                  >
                    {CLEFS.map((c) => (
                      <option key={c} value={c}>
                        {t(`edit.clef.${c}`)}
                      </option>
                    ))}
                  </select>
                </label>
                {line.id !== MAIN_LINE_ID && (
                  <NumberField label={t("edit.line.height")} max={8} min={0} onChange={(height) => api.patchLine(line.id, { height })} step={0.5} value={line.height} />
                )}
                <div className="flex flex-wrap gap-2">
                  <button aria-pressed={line.muted} className={`${BUTTON} ${line.muted ? ACTIVE : ""}`} onClick={() => api.patchLine(line.id, { muted: !line.muted })} type="button">
                    {t("edit.line.mute")}
                  </button>
                  <button aria-pressed={line.solo} className={`${BUTTON} ${line.solo ? ACTIVE : ""}`} onClick={() => api.patchLine(line.id, { solo: !line.solo })} type="button">
                    {t("edit.line.solo")}
                  </button>
                  <button className={BUTTON} disabled={i === 0} onClick={() => api.shiftLine(line.id, -1)} type="button">
                    {t("edit.line.earlier")}
                  </button>
                  <button className={BUTTON} disabled={i === api.lines.length - 1} onClick={() => api.shiftLine(line.id, 1)} type="button">
                    {t("edit.line.later")}
                  </button>
                  <button className={BUTTON} onClick={() => api.copyLine(line.id)} type="button">
                    {t("edit.line.duplicate")}
                  </button>
                  {line.id !== MAIN_LINE_ID && (
                    <button className={BUTTON} onClick={() => api.removeLine(line.id)} type="button">
                      {t("edit.line.delete")}
                    </button>
                  )}
                </div>
              </li>
            ))}
          </ul>
          <button className={BUTTON} disabled={api.lines.length >= 8} onClick={api.addLine} type="button">
            {t("edit.addLine")}
          </button>
        </section>
      )}

      {api.enabled && (
        <section aria-label={t("edit.note.title")} className="w-80 max-w-full space-y-2 rounded-2xl border border-white/20 bg-black/70 p-3 text-sm text-white backdrop-blur">
          <h2 className="font-medium">{selected ? `${t("edit.note.title")}: ${noteName(selected.midi)}` : t("edit.note.title")}</h2>
          {!selected && <p className="text-white/70">{t("edit.note.none")}</p>}
          {selected && (
            <>
              <NumberField label={t("edit.note.pitch")} max={108} min={21} onChange={(midi) => api.patchNote({ midi: Math.round(midi) })} step={1} value={selected.midi} />
              <NumberField label={t("edit.note.time")} max={600} min={0} onChange={(time) => api.patchNote({ time })} step={0.05} value={selected.time} />
              <NumberField label={t("edit.note.duration")} max={60} min={0.05} onChange={(duration) => api.patchNote({ duration })} step={0.05} value={selected.duration} />
              <NumberField label={t("edit.note.velocity")} max={1} min={0} onChange={(velocity) => api.patchNote({ velocity })} step={0.05} value={selected.velocity} />
              <label className="flex items-center gap-2">
                <span className="w-28 shrink-0">{t("edit.note.line")}</span>
                <select className={FIELD} onChange={(e) => api.patchNote({ lineId: e.target.value })} value={api.selectedLine}>
                  {api.lines.map((l) => (
                    <option key={l.id} value={l.id}>
                      {api.lineName(l)}
                    </option>
                  ))}
                </select>
              </label>
              <ColorField label={t("edit.note.color")} onChange={(color) => api.patchNote({ color })} value={api.selectedColor} />
              <div className="flex flex-wrap gap-2">
                <button className={BUTTON} onClick={api.playSelected} type="button">
                  {t("edit.note.play")}
                </button>
                <button className={BUTTON} onClick={api.copyNote} type="button">
                  {t("edit.note.duplicate")}
                </button>
                <button className={BUTTON} onClick={api.restoreNote} type="button">
                  {t("edit.note.reset")}
                </button>
                <button className={BUTTON} onClick={api.removeNote} type="button">
                  {t("edit.note.delete")}
                </button>
              </div>
            </>
          )}
          <button className={BUTTON} onClick={api.addNoteAt} type="button">
            {t("edit.note.add")}
          </button>
        </section>
      )}
    </div>
  );
}
