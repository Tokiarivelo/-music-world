'use client';

import { useMemo } from 'react';
import { buildingVariantGeometries, craneGeometry, scaffoldGeometry } from '@/xr/shapes/house-shapes';
import { buildRecipeGeometry } from '@/xr/shapes/recipe-builder';
import { engineRecipe } from '@/xr/shapes/site-recipes';
import { SIGNAL_POLE_RECIPE } from '@/engine/city';
import type { EngineObject } from '../lib/inventory-model';
import { thumbnailFaces } from '../lib/thumbnail';
import { ThumbCanvas } from './ThumbCanvas';

/** Thumbnail of a building variant or the construction scaffold; a letter for the objects with no shape of their own. */
export function EngineThumb({ object, color, name }: { object: EngineObject; color: string; name: string }) {
  const faces = useMemo(() => {
    if (object.shape === null) return [];
    const pole = object.shape === 'pole' ? engineRecipe(SIGNAL_POLE_RECIPE) : null;
    const g =
      object.shape === 'scaffold' ? scaffoldGeometry()
      : object.shape === 'crane' ? craneGeometry()
      : object.shape === 'pole' ? (pole ? buildRecipeGeometry(pole) : null)
      : buildingVariantGeometries()[object.shape];
    if (!g) return [];
    const flat = g.index ? g.toNonIndexed() : g;
    const out = thumbnailFaces(flat.getAttribute('position').array);
    g.dispose();
    return out;
  }, [object.shape]);
  return <ThumbCanvas faces={faces} color={color} letter={name} />;
}
