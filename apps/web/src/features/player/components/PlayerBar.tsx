"use client";

import { useEffect } from "react";
import { useT } from "@/i18n";
import { SEEK_STEP_SEC } from "../consts/player.consts";
import type { SongPlayer } from "../hooks/use-song-player";
import { usePlaybackTime } from "../hooks/use-playback-time";

function formatTime(sec: number): string {
  const s = Math.max(0, Math.floor(sec));
  return `${Math.floor(s / 60)}:${String(s % 60).padStart(2, "0")}`;
}

interface PlayerBarProps {
  player: SongPlayer;
}

/** Play/pause, seek slider and time; keyboard: space = play/pause, arrows = seek ±5 s. */
export function PlayerBar({ player }: PlayerBarProps) {
  const t = useT("player");
  const time = usePlaybackTime(player.clock);
  const { toggle, seekBy } = player;

  useEffect(() => {
    const onKey = (event: KeyboardEvent) => {
      const target = event.target as HTMLElement | null;
      if (
        target &&
        ["INPUT", "TEXTAREA", "BUTTON", "SELECT"].includes(target.tagName) &&
        event.key !== "ArrowLeft" &&
        event.key !== "ArrowRight"
      ) {
        return;
      }
      if (event.key === " ") {
        event.preventDefault();
        toggle();
      } else if (event.key === "ArrowLeft") {
        event.preventDefault();
        seekBy(-SEEK_STEP_SEC);
      } else if (event.key === "ArrowRight") {
        event.preventDefault();
        seekBy(SEEK_STEP_SEC);
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [toggle, seekBy]);

  if (!player.ready)
    return <p className="p-4 text-center text-sm">{t("loading")}</p>;

  return (
    <div className="flex w-full items-center gap-3 px-4 py-3 sm:gap-4 sm:px-6">
      <button
        aria-label={player.playing ? t("pause") : t("play")}
        className="min-w-20 rounded-full bg-[var(--mw-primary)] px-4 py-2 font-medium text-black"
        onClick={toggle}
        type="button"
      >
        {player.playing ? t("pause") : t("play")}
      </button>
      <input
        aria-label={t("seek")}
        className="flex-1 accent-[var(--mw-accent)]"
        max={player.duration}
        min={0}
        onChange={(e) => player.seek(Number(e.target.value))}
        step={0.01}
        type="range"
        value={Math.min(time, player.duration)}
      />
      <span className="w-24 text-right text-sm tabular-nums">
        {formatTime(time)} / {formatTime(player.duration)}
      </span>
    </div>
  );
}
