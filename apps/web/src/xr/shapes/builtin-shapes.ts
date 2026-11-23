/**
 * Builtin shape geometries: unit footprint (1 × 1 on x/z), base at y = 0, height 1. Instances scale them by
 * (footprint, height, footprint). Built once per kind and shared by one InstancedMesh.
 */
import { BoxGeometry, BufferGeometry, ConeGeometry, IcosahedronGeometry, OctahedronGeometry } from 'three';
import { mergeGeometries } from 'three/examples/jsm/utils/BufferGeometryUtils.js';
import type { ShapeKind } from '@/engine/types';

function baseAtZero(geometry: BufferGeometry, height: number): BufferGeometry {
  geometry.translate(0, height / 2, 0);
  return geometry;
}

function building(): BufferGeometry {
  // Tower with a narrower set-back top, like the lit city blocks of the reference image.
  const body = baseAtZero(new BoxGeometry(1, 0.8, 1), 0.8);
  const top = baseAtZero(new BoxGeometry(0.6, 0.2, 0.6), 0.2).translate(0, 0.8, 0);
  return mergeGeometries([body.toNonIndexed(), top.toNonIndexed()]) ?? body;
}

function spike(): BufferGeometry {
  return baseAtZero(new ConeGeometry(0.5, 1, 4, 1), 1);
}

function terrainRidge(): BufferGeometry {
  return baseAtZero(new ConeGeometry(0.5, 1, 7, 2), 1);
}

/** Rescales y so the geometry spans exactly [0, 1]. */
function unitHeight(geometry: BufferGeometry): BufferGeometry {
  geometry.computeBoundingBox();
  const box = geometry.boundingBox!;
  const h = box.max.y - box.min.y;
  return geometry.translate(0, -box.min.y, 0).scale(1, 1 / h, 1);
}

function crystal(): BufferGeometry {
  return unitHeight(new OctahedronGeometry(0.5, 0));
}

function cluster(): BufferGeometry {
  return unitHeight(new IcosahedronGeometry(0.5, 0));
}

/** Geometry for a kind; `recipe:*` kinds use a box until the ShapeRecipe builder exists. */
export function buildShapeGeometry(kind: ShapeKind): BufferGeometry {
  switch (kind) {
    case 'building':
      return building();
    case 'spike':
      return spike();
    case 'terrain_ridge':
      return terrainRidge();
    case 'crystal':
      return crystal();
    case 'cluster':
      return cluster();
    default:
      return baseAtZero(new BoxGeometry(1, 1, 1), 1);
  }
}

export function triangleCount(geometry: BufferGeometry): number {
  const index = geometry.getIndex();
  return (index ? index.count : (geometry.getAttribute('position')?.count ?? 0)) / 3;
}
