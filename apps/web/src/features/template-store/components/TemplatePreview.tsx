'use client';

import { useEffect, useRef } from 'react';
import type { Template } from '@/templates/generated';
import { useT } from '@/i18n';
import { THUMBNAIL_SIZE } from '../consts/template-store.consts';
import { drawTemplatePreview } from '../lib/thumbnail';

interface TemplatePreviewProps {
  template: Template;
}

/** Palette preview drawn on a 2D canvas when a template has no thumbnail. */
export function TemplatePreview({ template }: TemplatePreviewProps) {
  const t = useT('store');
  const canvas = useRef<HTMLCanvasElement>(null);
  useEffect(() => {
    let ctx: CanvasRenderingContext2D | null = null;
    try {
      ctx = canvas.current?.getContext('2d') ?? null;
    } catch {
      ctx = null; // no 2D canvas (tests)
    }
    if (ctx) drawTemplatePreview(ctx, template);
  }, [template]);
  return (
    <canvas
      ref={canvas}
      width={THUMBNAIL_SIZE}
      height={THUMBNAIL_SIZE}
      role="img"
      aria-label={t('previewAlt', { name: template.name })}
      className="aspect-square w-full rounded"
    />
  );
}
