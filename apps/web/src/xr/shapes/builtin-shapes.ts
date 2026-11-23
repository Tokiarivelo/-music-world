/**
 * Builtin shape geometries: unit footprint (1 × 1 on x/z), base at y = 0, height 1. Instances scale them by
 * (footprint, height, footprint). Built once per kind and shared by one InstancedMesh.
 */
import {
  BoxGeometry,
  BufferGeometry,
  ConeGeometry,
  Float32BufferAttribute,
  IcosahedronGeometry,
  OctahedronGeometry,
  PlaneGeometry,
  Vector3,
} from 'three';
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

/** Summits of the ridge shape (x, z, radius, height) in the unit footprint: a main peak and two shoulders. */
const RIDGE_PEAKS: ReadonlyArray<readonly [number, number, number, number]> = [
  [0.05, 0, 0.42, 1],
  [-0.22, 0.1, 0.3, 0.62],
  [0.25, -0.12, 0.28, 0.5],
];
const RIDGE_GRID = 10;
const RIDGE_LIGHT = new Vector3(-0.5, 0.75, 0.45).normalize();

function ridgeHeight(x: number, z: number): number {
  let h = 0;
  for (const [px, pz, r, ph] of RIDGE_PEAKS) {
    const d2 = ((x - px) ** 2 + (z - pz) ** 2) / (r * r);
    if (d2 < 1) h = Math.max(h, ph * (1 - d2) * (0.75 + 0.25 * Math.abs(Math.sin(5 * Math.atan2(z - pz, x - px)))));
  }
  return h;
}

/**
 * Rugged mountain (04-default-template requirement 2.4): a small creased height field with baked grey shading in its
 * vertex colors; the instance color gives the terrain hue. Flat-shaded look from non-indexed faces.
 */
function terrainRidge(): BufferGeometry {
  const grid = new PlaneGeometry(1, 1, RIDGE_GRID, RIDGE_GRID).rotateX(-Math.PI / 2);
  const p = grid.getAttribute('position');
  for (let i = 0; i < p.count; i++) p.setY(i, ridgeHeight(p.getX(i), p.getZ(i)));
  const geometry = unitHeight(grid.toNonIndexed());
  const pos = geometry.getAttribute('position');
  const colors = new Float32Array(pos.count * 3);
  const a = new Vector3();
  const b = new Vector3();
  const c = new Vector3();
  for (let f = 0; f < pos.count; f += 3) {
    a.fromBufferAttribute(pos, f);
    b.fromBufferAttribute(pos, f + 1);
    c.fromBufferAttribute(pos, f + 2);
    const n = b.sub(a).cross(c.sub(a)).normalize();
    const shade = 0.35 + 0.65 * Math.max(0, n.dot(RIDGE_LIGHT));
    for (let k = 0; k < 3; k++) colors.set([shade, shade, shade], (f + k) * 3);
  }
  geometry.setAttribute('color', new Float32BufferAttribute(colors, 3));
  return geometry;
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
