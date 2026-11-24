"use client";

import { useMemo } from "react";
import { useT } from "@/i18n";
import { SiteNav } from "@/features/navigation";
import type { Analysis } from "@/templates/generated";
import {
  DirectorPanel,
  useDirector,
  type DirectorSource,
} from "@/features/director";
import { useStoreTemplates } from "@/features/template-store";
import { WorldView } from "@/features/world-view";
import { loadProjectAudio } from "../api/project.api";
import { useProjectAnalysis } from "../hooks/use-project-analysis";
import { usePlaySeed } from "../hooks/use-play-seed";
import { useSongPlayer } from "../hooks/use-song-player";
import { useAiTemplateChoice } from "../hooks/use-ai-template-choice";
import { useWorldControls } from "../hooks/use-world-controls";
import { seedFromHash } from "../lib/seed";
import { PlayerBar } from "./PlayerBar";
import { TemplateActions } from "./TemplateActions";

interface ProjectWorldProps {
  projectId: string;
  analysis: Analysis;
  storeTemplateId: string | null;
}

function ProjectWorld({
  projectId,
  analysis,
  storeTemplateId,
}: ProjectWorldProps) {
  const t = useT("player");
  const deps = useMemo(
    () => ({
      createContext: () => new AudioContext(),
      loadBuffer: () => loadProjectAudio(projectId),
    }),
    [projectId],
  );
  const player = useSongPlayer(deps);
  const source = useMemo<DirectorSource>(
    () => ({ kind: "project", projectId }),
    [projectId],
  );
  const director = useDirector(source);
  const store = useStoreTemplates(storeTemplateId);
  const choice = useAiTemplateChoice(director, store);
  const controls = useWorldControls(player, t("projectTitle"), choice);
  const { clock } = player;
  const { template } = choice;
  const seed = usePlaySeed(player.run, seedFromHash(analysis.audioHash));
  const scene = useMemo(
    () => ({ analysis, template, seed, clock }),
    [analysis, template, seed, clock],
  );
  return (
    <div className="relative h-dvh w-full">
      <WorldView controls={controls} scene={scene} />
      <div className="absolute left-3 top-3 z-10 max-w-[calc(100%-11rem)] sm:max-w-none">
        <SiteNav />
        <div className="mt-2" />
        <DirectorPanel director={director} template={template} />
        <div className="mt-2 rounded-lg bg-[var(--mw-bg)]/80 px-3 py-2 empty:hidden">
          <TemplateActions
            template={template}
            generatedHere={director.templates.includes(template)}
          />
        </div>
      </div>
      {/* IWSDK sizes its canvas to the window, so the controls float above it. */}
      <div className="absolute inset-x-0 bottom-0 z-10 bg-gradient-to-t from-[var(--mw-bg)] to-transparent pt-6">
        <PlayerBar player={player} />
        <p className="pb-2 text-center text-xs opacity-60">
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

/** `/play/<projectId>`: an uploaded song's analysis and audio, rendered with the default template or an AI-generated one. */
export function ProjectPlayback({
  projectId,
  storeTemplateId = null,
}: {
  projectId: string;
  storeTemplateId?: string | null;
}) {
  const t = useT("player");
  const state = useProjectAnalysis(projectId);
  if (state.kind === "ready") {
    return (
      <ProjectWorld
        projectId={projectId}
        analysis={state.analysis}
        storeTemplateId={storeTemplateId}
      />
    );
  }
  return (
    <div className="flex h-dvh items-center justify-center p-6 text-center">
      {state.kind === "loading" ? (
        <p role="status">{t("loadingProject")}</p>
      ) : (
        <p role="alert" className="text-[var(--mw-accent)]">
          {t.error(state.messageKey)}
        </p>
      )}
    </div>
  );
}
