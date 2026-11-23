'use client';

import { useEffect, useRef, useState } from 'react';
import { createMusicWorld, type WorldHandle, type WorldScene } from '@/xr/world-host';
import { WORLD_VIEW_TEXT } from '../consts/world-view.consts';

interface WorldCanvasProps {
  scene?: WorldScene;
}

export default function WorldCanvas({ scene }: WorldCanvasProps) {
  const containerRef = useRef<HTMLDivElement>(null);
  const handleRef = useRef<WorldHandle | null>(null);
  const [vrSupported, setVrSupported] = useState(false);
  const [failed, setFailed] = useState(false);
  const [handle, setHandle] = useState<WorldHandle | null>(null);

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
        console.error('[world-view] createMusicWorld failed', error);
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

  return (
    <div className="relative h-full w-full">
      <div ref={containerRef} aria-label={WORLD_VIEW_TEXT.canvasLabel} className="h-full w-full" role="img" />
      {failed && <p className="absolute inset-x-0 top-6 text-center">{WORLD_VIEW_TEXT.loadError}</p>}
      {vrSupported && (
        <button
          className="absolute right-4 top-4 z-10 rounded-full bg-[var(--mw-accent)] px-6 py-3 font-medium text-black"
          onClick={() => handleRef.current?.enterVR()}
          type="button"
        >
          {WORLD_VIEW_TEXT.enterVR}
        </button>
      )}
    </div>
  );
}
