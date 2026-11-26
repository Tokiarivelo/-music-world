'use client';

import { useEffect, useMemo, useRef } from 'react';
import type { Template } from '@/templates/generated';
import type { InventoryObject } from '../lib/inventory-model';
import { objectPositions } from '../lib/object-source';
import { thumbnailFaces } from '../lib/thumbnail';

const SIZE = 56;

/** A small 2D canvas drawing of the object (software projection: no WebGL context per thumbnail). */
export function ObjectThumb({ template, object }: { template: Template; object: InventoryObject }) {
  const ref = useRef<HTMLCanvasElement>(null);
  const recipe = object.recipeIndex === null ? null : template.recipes[object.recipeIndex];
  const faces = useMemo(() => {
    const positions = objectPositions(template, object);
    return positions ? thumbnailFaces(positions) : [];
    // The thumbnail follows the recipe of the object, not the whole draft.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [recipe, object.kind]);
  const color = template.palette.primary;
  useEffect(() => {
    const ctx = ref.current?.getContext('2d');
    if (!ctx) return;
    ctx.clearRect(0, 0, SIZE, SIZE);
    const [r, g, b] = [1, 3, 5].map((i) => parseInt(color.slice(i, i + 2), 16));
    for (const f of faces) {
      ctx.beginPath();
      ctx.moveTo(f.points[0] * SIZE, f.points[1] * SIZE);
      ctx.lineTo(f.points[2] * SIZE, f.points[3] * SIZE);
      ctx.lineTo(f.points[4] * SIZE, f.points[5] * SIZE);
      ctx.closePath();
      ctx.fillStyle = `rgb(${Math.round(r! * f.shade)},${Math.round(g! * f.shade)},${Math.round(b! * f.shade)})`;
      ctx.fill();
    }
  }, [faces, color]);
  if (faces.length === 0) {
    return (
      <span aria-hidden className="flex h-14 w-14 items-center justify-center rounded border border-white/20 text-lg opacity-60">
        {object.name.slice(0, 1).toUpperCase()}
      </span>
    );
  }
  return <canvas ref={ref} width={SIZE} height={SIZE} aria-hidden className="h-14 w-14 rounded border border-white/20" />;
}
