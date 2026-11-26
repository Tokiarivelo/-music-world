'use client';

import { useEffect, useRef, useState } from 'react';
import { useT } from '@/i18n';
import type { PartPalette } from '@/xr/shapes/node-builder';
import type { PartNode } from '../lib/node-model';
import { ObjectStage, type StageCallbacks, type StageSettings, type StageView } from '../lib/object-stage';

export type StageRequest = { n: number } & ({ type: 'view'; view: Exclude<StageView, 'free'> } | { type: 'frame'; ids: readonly string[] | null });

export interface StageCanvasProps extends StageCallbacks {
  nodes: readonly PartNode[];
  palette: PartPalette;
  base: string;
  accent: string;
  selection: readonly string[];
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
export function StageCanvas({ nodes, palette, base, accent, selection, settings, request, onPick, onBox, onTransform, onStats }: StageCanvasProps) {
  const t = useT('editor');
  const canvas = useRef<HTMLCanvasElement>(null);
  const stage = useRef<ObjectStage | null>(null);
  const [marquee, setMarquee] = useState<{ x: number; y: number; w: number; h: number } | null>(null);
  const callbacks = useRef<StageCallbacks>({ onPick, onBox, onMarquee: () => undefined, onTransform, onStats });
  useEffect(() => {
    callbacks.current = { onPick, onBox, onMarquee: setMarquee, onTransform, onStats };
  }, [onPick, onBox, onTransform, onStats]);
  const [supported] = useState(webglAvailable);

  useEffect(() => {
    const el = canvas.current;
    if (!el) return;
    if (!supported) return;
    stage.current = new ObjectStage(el, {
      onPick: (id, add) => callbacks.current.onPick(id, add),
      onBox: (ids, add) => callbacks.current.onBox(ids, add),
      onMarquee: (r) => callbacks.current.onMarquee(r),
      onTransform: (next, ids) => callbacks.current.onTransform(next, ids),
      onStats: (s) => callbacks.current.onStats(s),
    });
    return () => {
      stage.current?.dispose();
      stage.current = null;
    };
  }, [supported]);

  useEffect(() => {
    stage.current?.setNodes(nodes, palette, { base, accent });
    stage.current?.setSelection(selection);
  }, [nodes, palette, base, accent, selection]);
  useEffect(() => stage.current?.setSelection(selection), [selection]);
  useEffect(() => stage.current?.update(settings), [settings]);
  useEffect(() => {
    if (!request) return;
    if (request.type === 'view') stage.current?.setView(request.view);
    else stage.current?.frame(request.ids);
  }, [request]);

  if (!supported) {
    return (
      <p role="alert" className="flex h-full items-center justify-center p-6 text-center text-sm opacity-80">
        {t('workspace.noWebgl')}
      </p>
    );
  }
  return (
    <div className="relative h-full w-full">
      <canvas ref={canvas} role="img" aria-label={t('workspace.viewport')} className="block h-full w-full touch-none outline-none" tabIndex={0} />
      {marquee && <div aria-hidden className="pointer-events-none absolute border border-[var(--mw-accent)] bg-[var(--mw-accent)]/15" style={{ left: marquee.x, top: marquee.y, width: marquee.w, height: marquee.h }} />}
    </div>
  );
}
