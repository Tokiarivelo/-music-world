"use client";

import { useEffect, useRef, type PointerEvent } from "react";
import { useT } from "@/i18n";
import type { WorldHandle } from "@/xr/world-host";

/** Id of the map element: the pegman drop target. */
export const WALK_MAP_ID = "mw-walk-map";
const SIZE = 176;

interface WalkMapProps {
  handle: WorldHandle;
  /** Bigger while the pegman is being dragged, so it is easy to aim. */
  dragging: boolean;
}

/** Top-down map of the walk area. Click or drag on it to put the walker there (like the Street View pegman). */
export function WalkMap({ handle, dragging }: WalkMapProps) {
  const t = useT("world");
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const size = dragging ? SIZE * 1.5 : SIZE;

  useEffect(() => {
    let raf = 0;
    const draw = (): void => {
      raf = requestAnimationFrame(draw);
      const canvas = canvasRef.current;
      const map = handle.walkMap();
      const ctx = canvas?.getContext("2d");
      if (!canvas || !ctx || !map) return;
      const px = canvas.width;
      const toX = (x: number): number =>
        ((x - map.cx) / map.limit / 2 + 0.5) * px;
      const toY = (z: number): number =>
        ((z - map.cz) / map.limit / 2 + 0.5) * px;
      const k = px / (map.limit * 2);
      ctx.clearRect(0, 0, px, px);
      ctx.fillStyle = "rgba(20,24,34,0.92)";
      ctx.beginPath();
      if (map.round) ctx.arc(px / 2, px / 2, px / 2, 0, Math.PI * 2);
      else ctx.rect(0, 0, px, px);
      ctx.fill();
      ctx.fillStyle = "rgba(255,255,255,0.35)";
      for (const c of map.obstacles) {
        ctx.beginPath();
        ctx.arc(toX(c.x), toY(c.z), Math.max(1.5, c.r * k), 0, Math.PI * 2);
        ctx.fill();
      }
      const { x, z, yaw } = map.pose;
      const cx = toX(x);
      const cy = toY(z);
      // View cone: yaw 0 looks toward −z (up on the map), positive yaw turns toward −x.
      const a = -Math.PI / 2 - yaw;
      ctx.fillStyle = "rgba(255,170,0,0.35)";
      ctx.beginPath();
      ctx.moveTo(cx, cy);
      ctx.arc(cx, cy, 26, a - 0.55, a + 0.55);
      ctx.closePath();
      ctx.fill();
      ctx.fillStyle = "#ffb000";
      ctx.strokeStyle = "#000";
      ctx.lineWidth = 2;
      ctx.beginPath();
      ctx.arc(cx, cy, 6, 0, Math.PI * 2);
      ctx.fill();
      ctx.stroke();
    };
    draw();
    return () => cancelAnimationFrame(raf);
  }, [handle]);

  const place = (e: PointerEvent<HTMLCanvasElement>): void => {
    const map = handle.walkMap();
    if (!map) return;
    const r = e.currentTarget.getBoundingClientRect();
    const u = ((e.clientX - r.left) / r.width - 0.5) * 2;
    const v = ((e.clientY - r.top) / r.height - 0.5) * 2;
    handle.placeWalker(map.cx + u * map.limit, map.cz + v * map.limit);
  };

  return (
    <canvas
      aria-label={t("nav.mapLabel")}
      className={`absolute bottom-24 left-4 z-10 cursor-crosshair touch-none border-2 border-white/30 shadow-lg ${
        handle.walkMap()?.round ? "rounded-full" : "rounded-lg"
      }`}
      height={SIZE * 2}
      id={WALK_MAP_ID}
      onPointerDown={(e) => {
        e.currentTarget.setPointerCapture(e.pointerId);
        place(e);
      }}
      onPointerMove={(e) => {
        if (e.buttons) place(e);
      }}
      ref={canvasRef}
      style={{ height: size, width: size }}
      title={t("nav.mapHint")}
      width={SIZE * 2}
    />
  );
}
