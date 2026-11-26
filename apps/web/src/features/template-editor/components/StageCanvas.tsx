'use client';

import { useEffect, useRef, useState } from 'react';
import { useT } from '@/i18n';
import type { PartPalette } from '@/xr/shapes/node-builder';
import type { PartNode } from '../lib/node-model';
import { ObjectStage, type StageCallbacks, type StageSettings, type StageView } from '../lib/object-stage';

export type StageRequest = { n: number } & ({ type: 'view'; view: Exclude<StageView, 'free'> } | { type: 'frame'; id: string | null });

export interface StageCanvasProps extends StageCallbacks {
  nodes: readonly PartNode[];
  palette: PartPalette;
  base: string;
  accent: string;
  selected: string | null;
  settings: StageSettings;
  request: StageRequest | null;
}

function webglAvailable(): boolean {
  try {
    const probe = document.createElement('canvas');
    return Boolean(probe.getContext('webgl2') ?? probe.getContext('webgl'));
  } catch {
    return false;
  }
}

/** Mounts the WebGL stage on a canvas and keeps it in step with the editor state. WebGL is checked: a note replaces the canvas when it is missing. */
export function StageCanvas({ nodes, palette, base, accent, selected, settings, request, onPick, onTransform, onStats }: StageCanvasProps) {
  const t = useT('editor');
  const canvas = useRef<HTMLCanvasElement>(null);
  const stage = useRef<ObjectStage | null>(null);
  const callbacks = useRef<StageCallbacks>({ onPick, onTransform, onStats });
  useEffect(() => {
    callbacks.current = { onPick, onTransform, onStats };
  });
  const [supported] = useState(webglAvailable);

  useEffect(() => {
    const el = canvas.current;
    if (!el) return;
    if (!supported) return;
    stage.current = new ObjectStage(el, {
      onPick: (id, add) => callbacks.current.onPick(id, add),
      onTransform: (next, id) => callbacks.current.onTransform(next, id),
      onStats: (s) => callbacks.current.onStats(s),
    });
    return () => {
      stage.current?.dispose();
      stage.current = null;
    };
  }, [supported]);

  useEffect(() => {
    stage.current?.setNodes(nodes, palette, { base, accent });
    stage.current?.setSelection(selected);
  }, [nodes, palette, base, accent, selected]);
  useEffect(() => stage.current?.setSelection(selected), [selected]);
  useEffect(() => stage.current?.update(settings), [settings]);
  useEffect(() => {
    if (!request) return;
    if (request.type === 'view') stage.current?.setView(request.view);
    else stage.current?.frame(request.id);
  }, [request]);

  if (!supported) {
    return (
      <p role="alert" className="flex h-full items-center justify-center p-6 text-center text-sm opacity-80">
        {t('workspace.noWebgl')}
      </p>
    );
  }
  return <canvas ref={canvas} role="img" aria-label={t('workspace.viewport')} className="block h-full w-full touch-none outline-none" tabIndex={0} />;
}
