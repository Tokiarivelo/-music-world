'use client';

import dynamic from 'next/dynamic';
import { WORLD_VIEW_TEXT } from '../consts/world-view.consts';

// The IWSDK world touches window/WebGL/WebXR: never render it on the server.
const WorldCanvas = dynamic(() => import('./WorldCanvas'), {
  ssr: false,
  loading: () => <p className="p-6 text-center">{WORLD_VIEW_TEXT.loading}</p>,
});

export function WorldView() {
  return <WorldCanvas />;
}
