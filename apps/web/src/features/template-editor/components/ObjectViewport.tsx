'use client';

import { useEffect, useMemo, useRef, useState } from 'react';
import { useT } from '@/i18n';
import { buildNodeGeometries } from '@/xr/shapes/node-builder';
import { DEFAULT_VIEW, MAX_PITCH, sceneFaces, type ThumbView } from '../lib/thumbnail';
import type { PartNode } from '../lib/node-model';

const SIZE = 320;
const DRAG_RAD_PER_PX = 0.01;
const KEY_STEP = 0.15;

function hex(color: string): [number, number, number] {
  return [1, 3, 5].map((i) => parseInt(color.slice(i, i + 2), 16)) as [number, number, number];
}

/** Orbit view of the object: drag (or arrow keys) to turn around it; the selected part is highlighted. */
export function ObjectViewport({ nodes, selected, color, highlight }: { nodes: readonly PartNode[]; selected: string | null; color: string; highlight: string }) {
  const t = useT('editor');
  const ref = useRef<HTMLCanvasElement>(null);
  const drag = useRef<{ x: number; y: number } | null>(null);
  const [view, setView] = useState<ThumbView>(DEFAULT_VIEW);
  const groups = useMemo(() => {
    const visible = nodes.filter((n) => !n.hidden);
    const geometries = buildNodeGeometries(nodes);
    const out = geometries.map((g, i) => ({ id: visible[i]!.id, positions: g.getAttribute('position').array }));
    geometries.forEach((g) => g.dispose());
    return out;
  }, [nodes]);
  const faces = useMemo(() => sceneFaces(groups, view), [groups, view]);
  useEffect(() => {
    const ctx = ref.current?.getContext('2d');
    if (!ctx) return;
    ctx.clearRect(0, 0, SIZE, SIZE);
    const base = hex(color);
    const lit = hex(highlight);
    for (const f of faces) {
      const [r, g, b] = f.id === selected ? lit : base;
      ctx.beginPath();
      ctx.moveTo(f.points[0] * SIZE, f.points[1] * SIZE);
      ctx.lineTo(f.points[2] * SIZE, f.points[3] * SIZE);
      ctx.lineTo(f.points[4] * SIZE, f.points[5] * SIZE);
      ctx.closePath();
      ctx.fillStyle = `rgb(${Math.round(r * f.shade)},${Math.round(g * f.shade)},${Math.round(b * f.shade)})`;
      ctx.fill();
      if (f.id === selected) {
        ctx.strokeStyle = highlight;
        ctx.lineWidth = 1;
        ctx.stroke();
      }
    }
  }, [faces, selected, color, highlight]);
  const turn = (dyaw: number, dpitch: number) =>
    setView((v) => ({ yaw: v.yaw + dyaw, pitch: Math.min(MAX_PITCH, Math.max(-MAX_PITCH, v.pitch + dpitch)) }));
  return (
    <canvas
      ref={ref}
      width={SIZE}
      height={SIZE}
      tabIndex={0}
      role="img"
      aria-label={t('viewport.label')}
      className="aspect-square w-full max-w-80 touch-none cursor-grab self-center rounded border border-white/20 bg-black/30"
      onPointerDown={(e) => {
        drag.current = { x: e.clientX, y: e.clientY };
        e.currentTarget.setPointerCapture?.(e.pointerId);
      }}
      onPointerMove={(e) => {
        if (!drag.current) return;
        turn((e.clientX - drag.current.x) * DRAG_RAD_PER_PX, (e.clientY - drag.current.y) * DRAG_RAD_PER_PX);
        drag.current = { x: e.clientX, y: e.clientY };
      }}
      onPointerUp={() => (drag.current = null)}
      onPointerCancel={() => (drag.current = null)}
      onKeyDown={(e) => {
        const step = { ArrowLeft: [-KEY_STEP, 0], ArrowRight: [KEY_STEP, 0], ArrowUp: [0, KEY_STEP], ArrowDown: [0, -KEY_STEP] }[e.key];
        if (!step) return;
        e.preventDefault();
        turn(step[0]!, step[1]!);
      }}
    />
  );
}
