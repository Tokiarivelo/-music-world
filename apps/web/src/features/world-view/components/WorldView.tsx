'use client';

import dynamic from 'next/dynamic';
import type { WorldScene } from '@/xr/world-host';
import { WORLD_VIEW_TEXT } from '../consts/world-view.consts';

// The IWSDK world touches window/WebGL/WebXR: never render it on the server.
const WorldCanvas = dynamic(() => import('./WorldCanvas'), {
  ssr: false,
  loading: () => <p className="p-6 text-center">{WORLD_VIEW_TEXT.loading}</p>,
});

interface WorldViewProps {
  /** Song, template, seed and audio clock to render; the world stays empty until one is given. */
  scene?: WorldScene;
}

export function WorldView({ scene }: WorldViewProps) {
  return <WorldCanvas scene={scene} />;
}
