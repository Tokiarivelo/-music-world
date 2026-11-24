'use client';

import { useEffect, useMemo, useRef, useState } from 'react';
import { useT } from '@/i18n';
import type { NavigationState } from '@/xr/navigation/navigation-controller';
import type { ViewPresetId } from '@/xr/navigation/orbit-camera';
import { createMusicWorld, type WorldControls, type WorldHandle, type WorldScene } from '@/xr/world-host';
import {
  INITIAL_NAVIGATION_STATE,
  useNavigationShortcuts,
  type NavigationCommands,
} from '../hooks/use-navigation-shortcuts';
import { NavigationControls } from './NavigationControls';

interface WorldCanvasProps {
  scene?: WorldScene;
  controls?: WorldControls;
}

export default function WorldCanvas({ scene, controls }: WorldCanvasProps) {
  const t = useT('world');
  const containerRef = useRef<HTMLDivElement>(null);
  const handleRef = useRef<WorldHandle | null>(null);
  const [vrSupported, setVrSupported] = useState(false);
  const [immersive, setImmersive] = useState(false);
  const [failed, setFailed] = useState(false);
  const [handle, setHandle] = useState<WorldHandle | null>(null);
  const [navigation, setNavigation] = useState<NavigationState>(INITIAL_NAVIGATION_STATE);

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

  // Player commands for VR; swapping them never rebuilds the world.
  useEffect(() => {
    handle?.setControls(controls ?? null);
  }, [handle, controls]);

  // The 2D button follows the XR session (07-xr-mode requirement 1.3).
  useEffect(() => handle?.onSessionChange(setImmersive), [handle]);

  // Camera navigation (08-navigation-mode): the buttons and the keys call the same commands.
  useEffect(() => handle?.onNavigationChange(setNavigation), [handle]);
  const exploring = navigation.mode === 'explore';
  const commands = useMemo<NavigationCommands | null>(
    () =>
      handle && {
        toggleExplore: () => handle.setCameraMode(exploring ? 'cinematic' : 'explore'),
        selectPreset: (id: ViewPresetId) => handle.setViewPreset(id),
        reset: () => handle.resetView(),
      },
    [handle, exploring],
  );
  useNavigationShortcuts(commands, !immersive);

  return (
    <div className="fixed inset-0">
      <div ref={containerRef} aria-label={t('canvasLabel')} className="h-full w-full" role="img" />
      {failed && <p className="absolute inset-x-0 top-6 text-center">{t('loadError')}</p>}
      {commands && !immersive && <NavigationControls commands={commands} state={navigation} />}
      {vrSupported && (
        <button
          className="absolute right-[max(1rem,env(safe-area-inset-right))] top-[max(1rem,env(safe-area-inset-top))] z-10 rounded-full bg-[var(--mw-accent)] px-6 py-3 font-medium text-black"
          onClick={() => (immersive ? handleRef.current?.exitVR() : handleRef.current?.enterVR())}
          type="button"
        >
          {immersive ? t('exitVR') : t('enterVR')}
        </button>
      )}
    </div>
  );
}
