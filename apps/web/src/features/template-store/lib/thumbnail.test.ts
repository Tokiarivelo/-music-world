import { describe, expect, it } from 'vitest';
import { NEON_NOCTURNE } from '@/templates/default';
import { drawTemplatePreview, type PreviewContext } from './thumbnail';

function recorder(): PreviewContext & { fills: string[]; strokes: number } {
  const ctx = {
    fillStyle: '',
    strokeStyle: '',
    lineWidth: 1,
    fills: [] as string[],
    strokes: 0,
    fillRect() {
      ctx.fills.push(String(ctx.fillStyle));
    },
    beginPath() {},
    moveTo() {},
    quadraticCurveTo() {},
    lineTo() {},
    closePath() {},
    fill() {
      ctx.fills.push(String(ctx.fillStyle));
    },
    stroke() {
      ctx.strokes += 1;
    },
  };
  return ctx;
}

describe('drawTemplatePreview', () => {
  it('paints the palette deterministically', () => {
    const a = recorder();
    const b = recorder();
    drawTemplatePreview(a, NEON_NOCTURNE);
    drawTemplatePreview(b, NEON_NOCTURNE);
    expect(a.fills).toEqual(b.fills);
    const { palette } = NEON_NOCTURNE;
    expect(a.fills.slice(0, 2)).toEqual([palette.background, palette.terrain]);
    expect(new Set(a.fills.slice(2))).toEqual(new Set([palette.primary, palette.accent, palette.secondary]));
    expect(a.strokes).toBe(5);
    expect(a.strokeStyle).toBe(palette.staff);
  });
});
