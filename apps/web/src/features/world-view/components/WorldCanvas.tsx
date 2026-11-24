"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { useT } from "@/i18n";
import type { NavigationState } from "@/xr/navigation/navigation-controller";
import type { ViewPresetId } from "@/xr/navigation/orbit-camera";
import {
  createMusicWorld,
  type WorldControls,
  type WorldHandle,
  type WorldScene,
} from "@/xr/world-host";
import {
  INITIAL_NAVIGATION_STATE,
  useNavigationShortcuts,
  type NavigationCommands,
} from "../hooks/use-navigation-shortcuts";
import { usePaletteOverride, usePaletteStore } from "../hooks/use-palette-override";
import { useHiddenLayers } from "../hooks/use-hidden-layers";
import { useEditShortcuts } from "../hooks/use-edit-shortcuts";
import { useNoteEdits } from "../hooks/use-note-edits";
import { EditToolbar } from "./EditToolbar";
import type { EditsRemote } from "../lib/edits-storage";
import { ColorsPopover } from "./ColorsPopover";
import { LayersPopover } from "./LayersPopover";
import { LyricsOverlay } from "./LyricsOverlay";
import { NavigationControls } from "./NavigationControls";

interface WorldCanvasProps {
  scene?: WorldScene;
  controls?: WorldControls;
  editsKey?: string;
  editsRemote?: EditsRemote;
  onScoreMode?(on: boolean): void;
}

export default function WorldCanvas({ scene, controls, editsKey, editsRemote, onScoreMode }: WorldCanvasProps) {
  const t = useT("world");
  const containerRef = useRef<HTMLDivElement>(null);
  const handleRef = useRef<WorldHandle | null>(null);
  const [vrSupported, setVrSupported] = useState(false);
  const [immersive, setImmersive] = useState(false);
  const [failed, setFailed] = useState(false);
  const [handle, setHandle] = useState<WorldHandle | null>(null);
  const [navigation, setNavigation] = useState<NavigationState>(
    INITIAL_NAVIGATION_STATE,
  );

  useEffect(() => {
    const container = containerRef.current;
    if (!container) return;
    let cancelled = false;
    let handle: WorldHandle | null = null;

    createMusicWorld(container)
      .then(async (created) => {
        if (cancelled) {
          created.dispose();
          return;
        }
        handle = created;
        handleRef.current = created;
        setHandle(created);
        setVrSupported(await created.isVRSupported());
      })
      .catch((error: unknown) => {
        console.error("[world-view] createMusicWorld failed", error);
        if (!cancelled) setFailed(true);
      });

    return () => {
      cancelled = true;
      handle?.dispose();
      handleRef.current = null;
    };
  }, []);

  // The world is rebuilt from the scene only when it changes (the plan is computed once per song).
  useEffect(() => {
    if (handle && scene) handle.load(scene);
  }, [handle, scene]);

  // The listener's colors (I4) go on top of the template after each load.
  usePaletteOverride(handle, scene);
  const paletteStore = usePaletteStore(scene);
  const [hiddenLayers, setHiddenLayers] = useHiddenLayers(handle);
  const persistence = useMemo(
    () => ({ key: editsKey, remote: editsRemote, onScoreMode }),
    [editsKey, editsRemote, onScoreMode],
  );
  const noteEdits = useNoteEdits(handle, scene, controls, persistence);
  useEditShortcuts(handle, noteEdits);
  const lyrics = scene?.analysis.lyrics;
  const hasLyrics = !!lyrics && lyrics.length > 0;

  // Player commands for VR; swapping them never rebuilds the world.
  useEffect(() => {
    handle?.setControls(controls ?? null);
  }, [handle, controls]);

  // The 2D button follows the XR session (07-xr-mode requirement 1.3).
  useEffect(() => handle?.onSessionChange(setImmersive), [handle]);

  // Camera navigation (08-navigation-mode): the buttons and the keys call the same commands.
  useEffect(() => handle?.onNavigationChange(setNavigation), [handle]);
  const exploring = navigation.mode === "explore";
  const walking = navigation.mode === "walk";
  const commands = useMemo<NavigationCommands | null>(
    () =>
      handle && {
        toggleExplore: () =>
          handle.setCameraMode(exploring ? "cinematic" : "explore"),
        toggleWalk: () => handle.setCameraMode(walking ? "cinematic" : "walk"),
        selectPreset: (id: ViewPresetId) => handle.setViewPreset(id),
        reset: () => handle.resetView(),
      },
    [handle, exploring, walking],
  );
  useNavigationShortcuts(commands, !immersive);

  return (
    <div className="fixed inset-0">
      <div
        ref={containerRef}
        aria-label={t("canvasLabel")}
        className="h-full w-full"
        role="img"
      />
      {failed && (
        <p className="absolute inset-x-0 top-6 text-center">{t("loadError")}</p>
      )}
      {commands && !immersive && (
        <NavigationControls commands={commands} state={navigation} />
      )}
      {paletteStore && scene && !immersive && (
        <ColorsPopover
          store={paletteStore}
          templatePalette={scene.template.palette}
        />
      )}
      {scene && !immersive && controls && <EditToolbar api={noteEdits} />}
      {scene && !immersive && (
        <>
          <LayersPopover
            activity={() => handle?.activity() ?? null}
            hasLyrics={hasLyrics}
            hidden={hiddenLayers}
            onChange={setHiddenLayers}
            palette={scene.template.palette}
          />
          {hasLyrics && (
            <LyricsOverlay hidden={hiddenLayers.has("lyrics")} lyrics={lyrics} now={() => scene.clock.now()} />
          )}
        </>
      )}
      {vrSupported && (
        <button
          className="absolute right-[max(1rem,env(safe-area-inset-right))] top-[max(1rem,env(safe-area-inset-top))] z-10 rounded-full bg-[var(--mw-accent)] px-6 py-3 font-medium text-black"
          onClick={() =>
            immersive
              ? handleRef.current?.exitVR()
              : handleRef.current?.enterVR()
          }
          type="button"
        >
          {immersive ? t("exitVR") : t("enterVR")}
        </button>
      )}
    </div>
  );
}
