'use client';

import { useEffect, useRef, useState } from 'react';
import { useT } from '@/i18n';
import { worldSize } from '@/engine/city';
import type { Template } from '@/templates/generated';
import { movePlaced, placedInBox, placedOf, snapTo, updatePlaced } from '../lib/map-model';
import { dotRadius, hitTest, rotateHandle, scaleFromPointer, scaleHandle, toScreen, toWorld, yawFromPointer, type PlanView, type Pt } from '../lib/plan-view';

const SIZE = 640;

export type MapTool = 'place' | 'select';

export interface MapCanvasProps {
  template: Template;
  selection: readonly string[];
  tool: MapTool;
  snap: number;
  onPlace(x: number, z: number): void;
  onSelect(ids: string[]): void;
  /** A drag in progress (not yet an undo step). */
  onPreview(next: Template | null): void;
  /** The end of a drag: one undo step. */
  onCommit(next: Template): void;
  onDelete(): void;
}

type Drag =
  | { type: 'move'; id: string; dx: number; dz: number; base: Template }
  | { type: 'rotate' | 'scale'; id: string; base: Template }
  | { type: 'box'; from: Pt; to: Pt }
  | null;

function colorOf(kind: string, template: Template): string {
  const roles = [template.palette.primary, template.palette.accent, template.palette.secondary];
  let h = 0;
  for (const c of kind) h = (h * 31 + c.charCodeAt(0)) >>> 0;
  return roles[h % roles.length]!;
}

/** The map seen from above: click to place, drag to move, handles to rotate and scale, drag the ground to box select. */
export function MapCanvas({ template, selection, tool, snap, onPlace, onSelect, onPreview, onCommit, onDelete }: MapCanvasProps) {
  const t = useT('maps');
  const ref = useRef<HTMLCanvasElement>(null);
  const drag = useRef<Drag>(null);
  const [box, setBox] = useState<{ from: Pt; to: Pt } | null>(null);
  const view: PlanView = { size: SIZE, half: worldSize(template) / 2 };
  const objects = placedOf(template);
  const selected = selection.length === 1 ? selection[0]! : null;

  useEffect(() => {
    const ctx = ref.current?.getContext('2d');
    if (!ctx) return;
    const plate = template.terrain.size / 2;
    ctx.clearRect(0, 0, SIZE, SIZE);
    ctx.fillStyle = template.palette.background;
    ctx.fillRect(0, 0, SIZE, SIZE);
    const a = toScreen(view, -plate, -plate);
    const b = toScreen(view, plate, plate);
    ctx.fillStyle = template.palette.terrain;
    ctx.fillRect(a.x, a.y, b.x - a.x, b.y - a.y);
    const step = view.half > 24 ? 5 : 1; // metres between grid lines
    ctx.strokeStyle = 'rgba(255,255,255,0.08)';
    ctx.lineWidth = 1;
    for (let m = -Math.floor(view.half); m <= view.half; m += step) {
      const v = toScreen(view, m, m);
      ctx.beginPath(); ctx.moveTo(v.x, 0); ctx.lineTo(v.x, SIZE); ctx.moveTo(0, v.y); ctx.lineTo(SIZE, v.y); ctx.stroke();
    }
    const origin = toScreen(view, 0, 0);
    ctx.strokeStyle = 'rgba(255,255,255,0.25)';
    ctx.beginPath(); ctx.moveTo(origin.x, 0); ctx.lineTo(origin.x, SIZE); ctx.moveTo(0, origin.y); ctx.lineTo(SIZE, origin.y); ctx.stroke();
    ctx.font = '10px sans-serif';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    for (const o of objects) {
      const c = toScreen(view, o.x, o.z);
      const r = dotRadius(o.scale);
      ctx.fillStyle = o.color ?? colorOf(o.kind, template);
      ctx.beginPath(); ctx.arc(c.x, c.y, r, 0, Math.PI * 2); ctx.fill();
      ctx.fillStyle = '#000';
      ctx.fillText((o.kind.startsWith('recipe:') ? o.kind.slice(7) : o.kind).slice(0, 1).toUpperCase(), c.x, c.y);
      if (selection.includes(o.id)) {
        ctx.strokeStyle = template.palette.accent;
        ctx.lineWidth = 2;
        ctx.beginPath(); ctx.arc(c.x, c.y, r + 2, 0, Math.PI * 2); ctx.stroke();
      }
    }
    const one = objects.find((o) => o.id === selected);
    if (one) {
      const c = toScreen(view, one.x, one.z);
      const rh = rotateHandle(c, one.scale, one.yaw);
      const sh = scaleHandle(c, one.scale);
      ctx.strokeStyle = template.palette.accent;
      ctx.lineWidth = 1;
      ctx.beginPath(); ctx.moveTo(c.x, c.y); ctx.lineTo(rh.x, rh.y); ctx.stroke();
      ctx.fillStyle = '#fff';
      ctx.beginPath(); ctx.arc(rh.x, rh.y, 5, 0, Math.PI * 2); ctx.fill();
      ctx.fillRect(sh.x - 4, sh.y - 4, 8, 8);
    }
    if (box) {
      ctx.strokeStyle = template.palette.accent;
      ctx.setLineDash([4, 3]);
      ctx.strokeRect(box.from.x, box.from.y, box.to.x - box.from.x, box.to.y - box.from.y);
      ctx.setLineDash([]);
    }
  });

  const point = (e: React.PointerEvent<HTMLCanvasElement>): Pt => {
    const r = e.currentTarget.getBoundingClientRect();
    return { x: ((e.clientX - r.left) / r.width) * SIZE, y: ((e.clientY - r.top) / r.height) * SIZE };
  };

  const onPointerDown = (e: React.PointerEvent<HTMLCanvasElement>) => {
    const p = point(e);
    const hit = hitTest(view, objects, selected, p);
    e.currentTarget.setPointerCapture?.(e.pointerId);
    if (hit.type === 'rotate' || hit.type === 'scale') {
      drag.current = { type: hit.type, id: hit.id, base: template };
    } else if (hit.type === 'object') {
      onSelect(e.shiftKey ? (selection.includes(hit.id) ? selection.filter((s) => s !== hit.id) : [...selection, hit.id]) : [hit.id]);
      const o = objects.find((x) => x.id === hit.id)!;
      const w = toWorld(view, p.x, p.y);
      drag.current = { type: 'move', id: hit.id, dx: o.x - w.x, dz: o.z - w.z, base: template };
    } else if (tool === 'place') {
      const w = toWorld(view, p.x, p.y);
      onPlace(w.x, w.z);
    } else {
      if (!e.shiftKey) onSelect([]);
      drag.current = { type: 'box', from: p, to: p };
      setBox({ from: p, to: p });
    }
  };

  const onPointerMove = (e: React.PointerEvent<HTMLCanvasElement>) => {
    const d = drag.current;
    if (!d) return;
    const p = point(e);
    if (d.type === 'box') {
      drag.current = { ...d, to: p };
      setBox({ from: d.from, to: p });
    } else if (d.type === 'move') {
      const w = toWorld(view, p.x, p.y);
      onPreview(movePlaced(d.base, d.id, w.x + d.dx, w.z + d.dz, snap));
    } else {
      const o = placedOf(d.base).find((x) => x.id === d.id);
      if (!o) return;
      const c = toScreen(view, o.x, o.z);
      onPreview(updatePlaced(d.base, d.id, d.type === 'rotate' ? { yaw: snapTo(yawFromPointer(c, p), snap > 0 ? 15 : 0) } : { scale: scaleFromPointer(c, p) }));
    }
  };

  const finish = (e: React.PointerEvent<HTMLCanvasElement>) => {
    const d = drag.current;
    drag.current = null;
    if (!d) return;
    if (d.type === 'box') {
      const a = toWorld(view, d.from.x, d.from.y);
      const b = toWorld(view, d.to.x, d.to.y);
      const ids = Math.hypot(d.to.x - d.from.x, d.to.y - d.from.y) < 4 ? [] : placedInBox(template, a.x, a.z, b.x, b.z);
      onSelect(e.shiftKey ? [...new Set([...selection, ...ids])] : ids);
      setBox(null);
      return;
    }
    onPreview(null);
    const p = point(e);
    const o = placedOf(d.base).find((x) => x.id === d.id);
    if (!o) return;
    const w = toWorld(view, p.x, p.y);
    const c = toScreen(view, o.x, o.z);
    const moved = d.type === 'move'
      ? movePlaced(d.base, d.id, w.x + d.dx, w.z + d.dz, snap)
      : updatePlaced(d.base, d.id, d.type === 'rotate' ? { yaw: snapTo(yawFromPointer(c, p), snap > 0 ? 15 : 0) } : { scale: scaleFromPointer(c, p) });
    onCommit(moved);
  };

  return (
    <canvas
      ref={ref}
      width={SIZE}
      height={SIZE}
      tabIndex={0}
      role="application"
      aria-label={t('canvas.label')}
      className="aspect-square h-full max-h-full w-auto max-w-full touch-none select-none self-center rounded-2xl border border-white/20"
      onPointerDown={onPointerDown}
      onPointerMove={onPointerMove}
      onPointerUp={finish}
      onPointerCancel={() => { drag.current = null; setBox(null); onPreview(null); }}
      onKeyDown={(e) => {
        if ((e.key === 'Delete' || e.key === 'Backspace') && selection.length > 0) {
          e.preventDefault();
          onDelete();
        }
      }}
    />
  );
}
