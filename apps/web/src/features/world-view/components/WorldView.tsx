"use client";

import dynamic from "next/dynamic";
import type { WorldControls, WorldScene } from "@/xr/world-host";
import { useT } from "@/i18n";

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
}

export function WorldView({ scene, controls }: WorldViewProps) {
  return <WorldCanvas controls={controls} scene={scene} />;
}
