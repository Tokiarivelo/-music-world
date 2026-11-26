"use client";

import { useEffect, useRef } from "react";
import { useT } from "@/i18n";
import type { WorldHandle } from "@/xr/world-host";

/** Id of the map element: the pegman drop target. */
export const WALK_MAP_ID = "mw-walk-map";
const SIZE = 176;

/** World metres under a client point of the map element. */
export function mapPoint(
  handle: WorldHandle,
  el: HTMLElement,
  clientX: number,
  clientY: number,
): { x: number; z: number } | null {
  const map = handle.walkMap();
  if (!map) return null;
  const r = el.getBoundingClientRect();
  const u = ((clientX - r.left) / r.width - 0.5) * 2;
  const v = ((clientY - r.top) / r.height - 0.5) * 2;
  return { x: map.cx + u * map.limit, z: map.cz + v * map.limit };
}

interface WalkMapProps {
  handle: WorldHandle;
  /** Bigger while the pegman is being dragged, so it is easy to aim. */
  dragging: boolean;
}

/** Top-down map of the walk area: streets, roads, lakes, structures and the walker. Click it to land there. */
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
      const k = px / (map.limit * 2);
      const toX = (x: number): number => (x - map.cx) * k + px / 2;
      const toY = (z: number): number => (z - map.cz) * k + px / 2;
      ctx.clearRect(0, 0, px, px);
      ctx.save();
      ctx.beginPath();
      if (map.round) ctx.arc(px / 2, px / 2, px / 2, 0, Math.PI * 2);
      else ctx.rect(0, 0, px, px);
      ctx.clip();
      ctx.fillStyle = "rgba(18,26,24,0.94)";
      ctx.fillRect(0, 0, px, px);
      ctx.fillStyle = "rgba(70,140,220,0.7)";
      for (const l of map.lakes) {
        ctx.beginPath();
        ctx.ellipse(
          toX(l.x),
          toY(l.z),
          l.rx * k,
          l.rz * k,
          l.rot,
          0,
          Math.PI * 2,
        );
        ctx.fill();
      }
      ctx.lineCap = "round";
      ctx.strokeStyle = "rgba(235,235,235,0.75)";
      for (const s of map.segments) {
        ctx.lineWidth = Math.max(1.5, s.width * k);
        ctx.beginPath();
        ctx.moveTo(toX(s.line[0]), toY(s.line[1]));
        ctx.lineTo(toX(s.line[2]), toY(s.line[3]));
        ctx.stroke();
      }
      ctx.fillStyle = "rgba(255,255,255,0.3)";
      for (const c of map.obstacles) {
        ctx.beginPath();
        ctx.arc(toX(c.x), toY(c.z), Math.max(1.5, c.r * k), 0, Math.PI * 2);
        ctx.fill();
      }
      ctx.restore();
      if (!map.pose) return;
      const { x, z, yaw } = map.pose;
      const cx = toX(x);
      const cy = toY(z);
      // View cone: yaw 0 looks toward −z (up on the map), positive yaw turns toward −x.
      const a = -Math.PI / 2 - yaw;
      ctx.fillStyle = "rgba(255,170,0,0.4)";
      ctx.beginPath();
      ctx.moveTo(cx, cy);
      ctx.arc(cx, cy, 30, a - 0.55, a + 0.55);
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

  return (
    <canvas
      aria-label={t("nav.mapLabel")}
      className={`absolute bottom-24 left-4 z-10 cursor-crosshair border-2 border-white/30 shadow-lg ${
        handle.walkMap()?.round ? "rounded-full" : "rounded-lg"
      }`}
      height={SIZE * 2}
      id={WALK_MAP_ID}
      onClick={(e) => {
        const p = mapPoint(handle, e.currentTarget, e.clientX, e.clientY);
        if (p) handle.landAtMap(p.x, p.z);
      }}
      ref={canvasRef}
      style={{ height: size, width: size }}
      title={t("nav.mapHint")}
      width={SIZE * 2}
    />
  );
}
