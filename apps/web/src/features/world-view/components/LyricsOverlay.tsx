"use client";

import { useEffect, useState } from "react";
import { lyricsAt } from "@/engine/layers";
import type { LyricSegment } from "@/engine/types";
import { useT } from "@/i18n";

interface LyricsOverlayProps {
  lyrics: readonly LyricSegment[];
  /** Audio clock in seconds (the same one the world is drawn from). */
  now(): number;
  hidden: boolean;
}

const POLL_MS = 100;

/** Karaoke line above the player bar (I5 requirement 4): the verse being sung, the next one dimmed. Seek-safe. */
export function LyricsOverlay({ lyrics, now, hidden }: LyricsOverlayProps) {
  const t = useT("world");
  const [at, setAt] = useState({ current: -1, next: -1 });

  useEffect(() => {
    if (hidden || lyrics.length === 0) return;
    const tick = () =>
      setAt((prev) => {
        const next = lyricsAt(lyrics, now());
        return prev.current === next.current && prev.next === next.next ? prev : next;
      });
    tick();
    const id = setInterval(tick, POLL_MS);
    return () => clearInterval(id);
  }, [lyrics, now, hidden]);

  if (hidden || lyrics.length === 0) return null;
  const current = at.current >= 0 ? lyrics[at.current] : null;
  const next = at.next >= 0 ? lyrics[at.next] : null;
  return (
    <section
      aria-label={t("lyrics.label")}
      className="pointer-events-none absolute inset-x-4 bottom-36 z-10 flex flex-col items-center gap-1 text-center"
    >
      <p className="max-w-3xl text-2xl font-semibold text-white drop-shadow-[0_2px_6px_rgba(0,0,0,0.8)]">{current?.text ?? " "}</p>
      {next && <p className="max-w-3xl text-base text-white/60 drop-shadow-[0_2px_4px_rgba(0,0,0,0.8)]">{next.text}</p>}
    </section>
  );
}
