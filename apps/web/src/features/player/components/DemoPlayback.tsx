"use client";

import { useEffect, useMemo } from "react";
import { usePlaylist } from "@/features/playlist";
import {
  useDirector,
  type DirectorSource,
} from "@/features/director";
import { useStoreTemplates } from "@/features/template-store";
import { WorldView } from "@/features/world-view";
import { loadAudioUrl } from "../api/project.api";
import { useT } from "@/i18n";
import { SiteNav } from "@/features/navigation";
import { GuidedTour } from "@/features/onboarding";
import { DEMO_SEED } from "../consts/player.consts";
import { DEMO_SONG } from "../demo/demo-song";
import { usePlaySeed } from "../hooks/use-play-seed";
import { useSongPlayer, type SongPlayerDeps } from "../hooks/use-song-player";
import { useAiTemplateChoice } from "../hooks/use-ai-template-choice";
import { useWorldControls } from "../hooks/use-world-controls";
import { synthesizeSong } from "../lib/synth-song";
import { PlayerBar } from "./PlayerBar";

const { analysis } = DEMO_SONG;
const DEMO_SOURCE: DirectorSource = { kind: "demo", analysis };

const DEMO_DEPS: SongPlayerDeps = {
  createContext: () => new AudioContext(),
  // The demo must never break: if the MP3 cannot be loaded, play the analysed notes synthesized in the browser.
  loadBuffer: () =>
    loadAudioUrl(DEMO_SONG.audioUrl).catch(() =>
      synthesizeSong(analysis.notes, analysis.durationSec),
    ),
};

/** `/play/demo`: the pre-analysed demo song and its audio, rendered with the default, a store or an AI-generated template
 * (`?template=<store id>` selects a store template). */
export function DemoPlayback({
  storeTemplateId = null,
}: {
  storeTemplateId?: string | null;
}) {
  const t = useT("player");
  const player = useSongPlayer(DEMO_DEPS);
  const director = useDirector(DEMO_SOURCE);
  const store = useStoreTemplates(storeTemplateId);
  const choice = useAiTemplateChoice(director, store);
  const controls = useWorldControls(player, DEMO_SONG.title, choice);
  const { clock } = player;
  const { template } = choice;
  const { ready: playlistReady, played } = usePlaylist();
  useEffect(() => {
    if (player.run > 0 && playlistReady) {
      played("demo", DEMO_SONG.title, { durationSec: analysis.durationSec, key: analysis.key, tempoBpm: analysis.tempoBpm, templateRef: storeTemplateId });
    }
  }, [player.run, playlistReady, played, storeTemplateId]);
  const seed = usePlaySeed(player.run, DEMO_SEED);
  const scene = useMemo(
    () => ({ analysis, template, seed, clock }),
    [template, seed, clock],
  );
  return (
    <div className="relative h-dvh w-full">
      <WorldView controls={controls} editsKey={analysis.audioHash} onScoreMode={player.setMuted} scene={scene} />
      <div className="absolute left-3 top-3 z-10 max-w-[calc(100%-11rem)] sm:max-w-none">
        <SiteNav template={template} />
      </div>
      <GuidedTour />
      {/* IWSDK sizes its canvas to the window, so the controls float above it. */}
      <div className="absolute inset-x-0 bottom-0 z-10 bg-gradient-to-t from-[var(--mw-bg)] to-transparent pt-6">
        <PlayerBar player={player} />
        <p className="pb-2 text-center text-xs opacity-60">
          {t("demoNote", { title: DEMO_SONG.title })} ·{" "}
          {t("demoStats", {
            key: analysis.key,
            bpm: Math.round(analysis.tempoBpm),
            count: analysis.notes.length,
          })}
        </p>
      </div>
    </div>
  );
}
