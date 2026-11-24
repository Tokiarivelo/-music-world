"use client";

import dynamic from "next/dynamic";
import type { WorldControls, WorldScene } from "@/xr/world-host";
import { useT } from "@/i18n";
import type { EditsRemote } from "../lib/edits-storage";
import type { LyricsSearch } from "../lib/lyrics-search";

// The IWSDK world touches window/WebGL/WebXR: never render it on the server.
const WorldCanvas = dynamic(() => import("./WorldCanvas"), {
  ssr: false,
  loading: () => <WorldLoading />,
});

function WorldLoading() {
  const t = useT("world");
  return <p className="p-6 text-center">{t("loading")}</p>;
}

interface WorldViewProps {
  /** Song, template, seed and audio clock to render; the world stays empty until one is given. */
  scene?: WorldScene;
  /** Player commands used in VR (controllers, spatial panel, pinch). */
  controls?: WorldControls;
  /** Where the note edits of this song are remembered in the browser (the audio hash); none = not remembered. */
  editsKey?: string;
  /** The signed-in owner's copy on the server (a project). */
  editsRemote?: EditsRemote;
  /** "Play my edits" replaces the song: the page mutes it while this is true. */
  onScoreMode?(on: boolean): void;
  /** Offered in the layers panel when the song has a voice but no lyrics. */
  lyricsSearch?: LyricsSearch;
}

export function WorldView({ scene, controls, editsKey, editsRemote, onScoreMode, lyricsSearch }: WorldViewProps) {
  return (
    <WorldCanvas
      controls={controls}
      editsKey={editsKey}
      editsRemote={editsRemote}
      lyricsSearch={lyricsSearch}
      onScoreMode={onScoreMode}
      scene={scene}
    />
  );
}
