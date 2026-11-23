'use client';

import { useEffect, useRef, useState } from 'react';
import { createMusicWorld, type WorldHandle } from '@/xr/world-host';
import { WORLD_VIEW_TEXT } from '../consts/world-view.consts';

export default function WorldCanvas() {
  const containerRef = useRef<HTMLDivElement>(null);
  const handleRef = useRef<WorldHandle | null>(null);
  const [vrSupported, setVrSupported] = useState(false);
  const [failed, setFailed] = useState(false);

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

  return (
    <div className="relative h-full w-full">
      <div ref={containerRef} aria-label={WORLD_VIEW_TEXT.canvasLabel} className="h-full w-full" role="img" />
      {failed && <p className="absolute inset-x-0 top-6 text-center">{WORLD_VIEW_TEXT.loadError}</p>}
      {vrSupported && (
        <button
          className="absolute bottom-6 left-1/2 -translate-x-1/2 rounded-full bg-[var(--mw-accent)] px-6 py-3 font-medium text-black"
          onClick={() => handleRef.current?.enterVR()}
          type="button"
        >
          {WORLD_VIEW_TEXT.enterVR}
        </button>
      )}
    </div>
  );
}
