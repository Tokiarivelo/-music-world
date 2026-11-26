'use client';

import { useMemo } from 'react';
import { buildingVariantGeometries, scaffoldGeometry } from '@/xr/shapes/house-shapes';
import type { EngineObject } from '../lib/inventory-model';
import { thumbnailFaces } from '../lib/thumbnail';
import { ThumbCanvas } from './ThumbCanvas';

/** Thumbnail of a building variant or the construction scaffold; a letter for the objects with no shape of their own. */
export function EngineThumb({ object, color, name }: { object: EngineObject; color: string; name: string }) {
  const faces = useMemo(() => {
    if (object.shape === null) return [];
    const g = object.shape === 'scaffold' ? scaffoldGeometry() : buildingVariantGeometries()[object.shape];
    if (!g) return [];
    const flat = g.index ? g.toNonIndexed() : g;
    const out = thumbnailFaces(flat.getAttribute('position').array);
    g.dispose();
    return out;
  }, [object.shape]);
  return <ThumbCanvas faces={faces} color={color} letter={name} />;
}
