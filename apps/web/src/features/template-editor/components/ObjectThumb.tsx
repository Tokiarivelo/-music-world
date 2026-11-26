'use client';

import { useEffect, useMemo, useState } from 'react';
import type { Template } from '@/templates/generated';
import type { InventoryObject } from '../lib/inventory-model';
import { loadModelMesh, toDisplayColors, type ModelMesh } from '../lib/model-mesh';
import { objectMesh } from '../lib/object-source';
import { thumbnailFaces } from '../lib/thumbnail';
import { ThumbCanvas } from './ThumbCanvas';

/** A small 2D canvas drawing of the object (software projection: no WebGL context per thumbnail). */
export function ObjectThumb({ template, object }: { template: Template; object: InventoryObject }) {
  const recipe = object.recipeIndex === null ? null : template.recipes[object.recipeIndex];
  // The world draws an authored 3D model instead of the procedural shape (`fx.material: polished`): show that model.
  const [model, setModel] = useState<ModelMesh | null>(null);
  useEffect(() => {
    let alive = true;
    if (object.authored) void loadModelMesh(object.kind).then((m) => alive && setModel(m));
    return () => {
      alive = false;
    };
  }, [object.kind, object.authored]);
  const faces = useMemo(() => {
    if (model) return thumbnailFaces(model.positions, 0.08, undefined, model.colors ? toDisplayColors(model.colors) : undefined);
    const mesh = objectMesh(template, object);
    return mesh ? thumbnailFaces(mesh.positions, 0.08, undefined, mesh.colors) : [];
    // The thumbnail follows the recipe of the object, not the whole draft.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [recipe, object.kind, model]);
  const color = model && model.colors ? '#ffffff' : template.palette.primary;
  return <ThumbCanvas faces={faces} color={color} letter={object.name} />;
}
