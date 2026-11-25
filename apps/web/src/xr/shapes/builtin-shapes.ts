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
import { airplane, bicycle, bush, car, cloud, conifer, tree } from './object-shapes';
import { buildRecipeGeometry, type ShapeRecipe } from './recipe-builder';

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

/** Needle heights of one equalizer cluster (fraction of the instance height), tallest in the middle. */
const NEEDLE_HEIGHTS = [0.32, 0.5, 0.42, 0.7, 0.86, 1, 0.78, 0.9, 0.62, 0.46, 0.55, 0.36, 0.28];
const NEEDLE_RADIUS = 0.035;
/** Brightness of a needle at its tip relative to its base (vertex colors, additive glow). */
const NEEDLE_TIP_BRIGHTNESS = 0.15;

/**
 * Equalizer spike cluster (04-default-template requirement 5.2): thin 4-sided needles side by side with an equalizer
 * envelope, staggered in depth; vertex colors fade from the base to the tip (additive material).
 */
function spike(): BufferGeometry {
  const parts = NEEDLE_HEIGHTS.map((h, i) => {
    const x = -0.5 + (i + 0.5) / NEEDLE_HEIGHTS.length;
    const z = ((i * 7) % 5) / 5 - 0.4;
    const needle = new ConeGeometry(NEEDLE_RADIUS, h, 4, 1, true).translate(x, h / 2, z * 0.6).toNonIndexed();
    const pos = needle.getAttribute('position');
    const colors = new Float32Array(pos.count * 3);
    for (let v = 0; v < pos.count; v++) {
      const b = 1 - (1 - NEEDLE_TIP_BRIGHTNESS) * (pos.getY(v) / h);
      colors.set([b, b, b], v * 3);
    }
    needle.setAttribute('color', new Float32BufferAttribute(colors, 3));
    needle.deleteAttribute('uv');
    return needle;
  });
  return mergeGeometries(parts) ?? parts[0]!;
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

/**
 * Geometry for a kind. `recipe:<name>` kinds are built from the template's `recipes`; a missing, invalid or over-budget
 * recipe falls back to a box, so a bad template still renders.
 */
export function buildShapeGeometry(kind: ShapeKind, recipes: readonly ShapeRecipe[] = []): BufferGeometry {
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
    case 'cloud':
      return cloud();
    case 'tree':
      return tree();
    case 'conifer':
      return conifer();
    case 'bush':
      return bush();
    case 'car':
      return car();
    case 'bicycle':
      return bicycle();
    case 'airplane':
      return airplane();
    default: {
      const recipe = recipes.find((r) => `recipe:${r.name}` === kind);
      return (recipe && buildRecipeGeometry(recipe)) || baseAtZero(new BoxGeometry(1, 1, 1), 1);
    }
  }
}

export function triangleCount(geometry: BufferGeometry): number {
  const index = geometry.getIndex();
  return (index ? index.count : (geometry.getAttribute('position')?.count ?? 0)) / 3;
}
