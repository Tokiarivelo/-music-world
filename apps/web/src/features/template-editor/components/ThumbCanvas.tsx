'use client';

import { useEffect, useRef } from 'react';
import { faceFill } from '../lib/face-color';
import type { ThumbFace } from '../lib/thumbnail';

const SIZE = 56;

/** Paints flat-shaded thumbnail faces on a small 2D canvas (software projection: no WebGL context per thumbnail). */
export function ThumbCanvas({ faces, color, letter }: { faces: readonly ThumbFace[]; color: string; letter: string }) {
  const ref = useRef<HTMLCanvasElement>(null);
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
      ctx.fillStyle = faceFill([r!, g!, b!], f);
      ctx.fill();
    }
  }, [faces, color]);
  if (faces.length === 0) {
    return (
      <span aria-hidden className="flex h-14 w-14 items-center justify-center rounded border border-white/20 text-lg opacity-60">
        {letter.slice(0, 1).toUpperCase()}
      </span>
    );
  }
  return <canvas ref={ref} width={SIZE} height={SIZE} aria-hidden className="h-14 w-14 rounded border border-white/20" />;
}
