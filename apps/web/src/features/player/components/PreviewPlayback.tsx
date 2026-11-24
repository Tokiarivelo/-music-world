"use client";

import { useMemo } from "react";
import { useT } from "@/i18n";
import { WorldView } from "@/features/world-view";
import type { Analysis, Template } from "@/templates/generated";
import { loadAudioUrl, loadProjectAudio } from "../api/project.api";
import { DEMO_SEED } from "../consts/player.consts";
import { DEMO_SONG } from "../demo/demo-song";
import { useProjectAnalysis } from "../hooks/use-project-analysis";
import { useSongPlayer, type SongPlayerDeps } from "../hooks/use-song-player";
import { useWorldControls } from "../hooks/use-world-controls";
import { seedFromHash } from "../lib/seed";
import { synthesizeSong } from "../lib/synth-song";
import { PlayerBar } from "./PlayerBar";

const NOOP = () => undefined;

interface PreviewWorldProps {
  analysis: Analysis;
  title: string;
  seed: number;
  template: Template;
  deps: SongPlayerDeps;
}

/** One song, one audio player, the world of `template`: a new template swaps the world, never the audio. */
function PreviewWorld({ analysis, title, seed, template, deps }: PreviewWorldProps) {
  const player = useSongPlayer(deps);
  const choice = useMemo(() => ({ template, templates: [template], selectTemplate: NOOP }), [template]);
  const controls = useWorldControls(player, title, choice);
  const { clock } = player;
  const scene = useMemo(() => ({ analysis, template, seed, clock }), [analysis, template, seed, clock]);
  return (
    <div className="relative h-full w-full">
      <WorldView controls={controls} scene={scene} />
      <div className="absolute inset-x-0 bottom-0 z-10 bg-gradient-to-t from-[var(--mw-bg)] to-transparent pt-6">
        <PlayerBar player={player} shortcuts={false} />
      </div>
    </div>
  );
}

const DEMO_DEPS: SongPlayerDeps = {
  createContext: () => new AudioContext(),
  loadBuffer: () =>
    loadAudioUrl(DEMO_SONG.audioUrl).catch(() => synthesizeSong(DEMO_SONG.analysis.notes, DEMO_SONG.analysis.durationSec)),
};

function ProjectPreview({ projectId, template, deps }: { projectId: string; template: Template; deps?: SongPlayerDeps }) {
  const t = useT("player");
  const state = useProjectAnalysis(projectId);
  const projectDeps = useMemo<SongPlayerDeps>(
    () => deps ?? { createContext: () => new AudioContext(), loadBuffer: () => loadProjectAudio(projectId) },
    [projectId, deps],
  );
  if (state.kind === "ready") {
    const { analysis } = state;
    return (
      <PreviewWorld analysis={analysis} title={t("projectTitle")} seed={seedFromHash(analysis.audioHash)} template={template} deps={projectDeps} />
    );
  }
  return (
    <div className="flex h-full items-center justify-center p-6 text-center">
      {state.kind === "loading" ? <p role="status">{t("loadingProject")}</p> : <p role="alert">{t.error(state.messageKey)}</p>}
    </div>
  );
}

interface PreviewPlaybackProps {
  template: Template;
  /** An uploaded song (`?project=<id>`); the demo song when absent. */
  projectId?: string | null;
  /** Audio dependencies, injected in tests. */
  deps?: SongPlayerDeps;
}

/** The song of the template editor: the demo (or a project) rendered with the template being edited. */
export function PreviewPlayback({ template, projectId = null, deps }: PreviewPlaybackProps) {
  if (projectId) return <ProjectPreview projectId={projectId} template={template} deps={deps} />;
  const { analysis, title } = DEMO_SONG;
  return <PreviewWorld analysis={analysis} title={title} seed={DEMO_SEED} template={template} deps={deps ?? DEMO_DEPS} />;
}
