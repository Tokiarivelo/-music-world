import type { Template } from '@/templates/generated';
import { THUMBNAIL_QUALITY, THUMBNAIL_SIZE } from '../consts/template-store.consts';

/** Minimal 2D drawing surface (a subset of `CanvasRenderingContext2D`, easy to fake in tests). */
export interface PreviewContext {
  fillStyle: string | CanvasGradient | CanvasPattern;
  strokeStyle: string | CanvasGradient | CanvasPattern;
  lineWidth: number;
  fillRect(x: number, y: number, w: number, h: number): void;
  beginPath(): void;
  moveTo(x: number, y: number): void;
  quadraticCurveTo(cx: number, cy: number, x: number, y: number): void;
  lineTo(x: number, y: number): void;
  closePath(): void;
  fill(): void;
  stroke(): void;
}

const CITY_BARS = [0.35, 0.6, 0.45, 0.8, 0.5, 0.95, 0.4, 0.7] as const;

/** Deterministic palette preview: background, plate, city bars in the primary → accent → secondary colors, staff. */
export function drawTemplatePreview(ctx: PreviewContext, template: Template, size: number = THUMBNAIL_SIZE): void {
  const { palette } = template;
  ctx.fillStyle = palette.background;
  ctx.fillRect(0, 0, size, size);
  // Isometric plate (a diamond).
  ctx.fillStyle = palette.terrain;
  ctx.beginPath();
  ctx.moveTo(size * 0.5, size * 0.3);
  ctx.lineTo(size * 0.95, size * 0.58);
  ctx.lineTo(size * 0.5, size * 0.86);
  ctx.lineTo(size * 0.05, size * 0.58);
  ctx.closePath();
  ctx.fill();
  const colors = [palette.primary, palette.accent, palette.secondary];
  CITY_BARS.forEach((height, i) => {
    ctx.fillStyle = colors[i % colors.length]!;
    const x = size * (0.16 + i * 0.042);
    ctx.fillRect(x, size * (0.6 - height * 0.32), size * 0.03, size * height * 0.32);
  });
  // Five staff lines crossing the plate diagonally.
  ctx.strokeStyle = palette.staff;
  ctx.lineWidth = Math.max(1, size / 128);
  for (let line = 0; line < 5; line += 1) {
    const offset = (line - 2) * size * 0.018;
    ctx.beginPath();
    ctx.moveTo(size * 0.12, size * 0.42 + offset);
    ctx.quadraticCurveTo(size * 0.5, size * 0.5 + offset, size * 0.88, size * 0.74 + offset);
    ctx.stroke();
  }
}

/** A small WebP (PNG fallback) thumbnail of the template, or null where no 2D canvas exists. */
export async function renderThumbnail(template: Template): Promise<Blob | null> {
  if (typeof document === 'undefined') return null;
  const canvas = document.createElement('canvas');
  canvas.width = THUMBNAIL_SIZE;
  canvas.height = THUMBNAIL_SIZE;
  let ctx: CanvasRenderingContext2D | null = null;
  try {
    ctx = canvas.getContext('2d');
  } catch {
    return null; // jsdom without the canvas package
  }
  if (!ctx) return null;
  drawTemplatePreview(ctx, template);
  const blob = await new Promise<Blob | null>((resolve) => canvas.toBlob(resolve, 'image/webp', THUMBNAIL_QUALITY));
  if (blob && blob.type === 'image/webp') return blob;
  return new Promise<Blob | null>((resolve) => canvas.toBlob(resolve, 'image/png'));
}
